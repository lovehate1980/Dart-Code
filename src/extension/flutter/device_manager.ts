import * as vs from "vscode";
import { config } from "../config";
import { logError } from "../utils/log";
import { FlutterDaemon } from "./flutter_daemon";
import * as f from "./flutter_types";

const emulatorNameRegex = new RegExp("^[a-z][a-z0-9_]*$");

export class FlutterDeviceManager implements vs.Disposable {
	private subscriptions: vs.Disposable[] = [];
	private statusBarItem: vs.StatusBarItem;
	private devices: f.Device[] = [];
	public currentDevice?: f.Device;

	constructor(private daemon: FlutterDaemon) {
		this.statusBarItem = vs.window.createStatusBarItem(vs.StatusBarAlignment.Right, 1);
		this.statusBarItem.tooltip = "Flutter";
		this.statusBarItem.command = "flutter.selectDevice";
		this.updateStatusBar();

		this.subscriptions.push(this.statusBarItem);
		this.subscriptions.push(vs.commands.registerCommand("flutter.selectDevice", this.showDevicePicker, this));
		this.subscriptions.push(vs.commands.registerCommand("flutter.launchEmulator", this.promptForAndLaunchEmulator, this));

		daemon.registerForDeviceAdded(this.deviceAdded.bind(this));
		daemon.registerForDeviceRemoved(this.deviceRemoved.bind(this));
	}

	public dispose() {
		this.subscriptions.forEach((s) => s.dispose());
	}

	public deviceAdded(dev: f.Device) {
		dev = { ...dev, type: "device" };
		this.devices.push(dev);
		if (!this.currentDevice || config.flutterSelectDeviceWhenConnected) {
			this.currentDevice = dev;
		}
		this.updateStatusBar();
	}

	public deviceRemoved(dev: f.Device) {
		this.devices = this.devices.filter((d) => d.id !== dev.id);
		if (this.currentDevice && this.currentDevice.id === dev.id)
			this.currentDevice = this.devices.length === 0 ? undefined : this.devices[this.devices.length - 1];
		this.updateStatusBar();
	}

	public async showDevicePicker(): Promise<void> {
		const devices: PickableDevice[] = this.devices
			.sort(this.deviceSortComparer.bind(this))
			.map((d) => ({
				description: d.platform,
				device: d,
				label: d.name,
				picked: d === this.currentDevice ? true : undefined,
			}));

		const quickPick = vs.window.createQuickPick<PickableDevice>();
		quickPick.busy = true;
		quickPick.items = devices;
		quickPick.placeholder = "Select a device to use";

		// Also kick of async work to add emulators to the list.
		this.getEmulatorItems(true).then((emulators) => {
			quickPick.busy = false;
			quickPick.items = [...devices, ...emulators];
		});

		const selection = await new Promise<PickableDevice>((resolve) => {
			quickPick.onDidAccept(() => resolve(quickPick.selectedItems && quickPick.selectedItems[0]));
			quickPick.onDidHide(() => resolve(undefined));
			quickPick.show();
		});
		quickPick.dispose();
		if (selection && selection.device) {
			switch (selection.device.type) {
				case "emulator-creator":
					await this.createEmulator();
					break;
				case "emulator":
					await this.launchEmulator(selection.device);
					break;
				case "device":
					this.currentDevice = selection.device;
					this.updateStatusBar();
					break;
			}
		}
	}

	public deviceSortComparer(d1: f.Device, d2: f.Device): number {
		// Always consider current device to be first.
		if (d1 === this.currentDevice) return -1;
		if (d2 === this.currentDevice) return 1;
		// Otherwise, sort by name.
		return d1.name.localeCompare(d2.name);
	}

	public updateStatusBar(): void {
		if (this.currentDevice)
			this.statusBarItem.text = `${this.currentDevice.name} (${this.currentDevice.platform}${this.currentDevice.emulator ? " Emulator" : ""})`;
		else
			this.statusBarItem.text = "No Devices";

		// Only show the status bar item when we're ready (eg. we may have kicked off a Dart download).
		if (this.daemon.isReady)
			this.statusBarItem.show();

		if (this.devices.length > 1) {
			this.statusBarItem.tooltip = `${this.devices.length} Devices Connected`;
		} else if (this.devices.length === 1) {
			this.statusBarItem.tooltip = `1 Device Connected`;
		} else {
			this.statusBarItem.tooltip = undefined;
		}
	}

	private async getEmulators(): Promise<f.Emulator[]> {
		try {
			const emus = await this.daemon.getEmulators();
			return emus.map((e) => ({
				id: e.id,
				name: e.name || e.id,
				type: "emulator",
			}));
		} catch (e) {
			logError({ message: e });
			return [];
		}
	}

	public async promptForAndLaunchEmulator(allowAutomaticSelection = false): Promise<boolean> {
		const emulators = await this.getEmulatorItems(false);

		// Because the above call is async, it's possible a device was connected while we were calling. If so,
		// just use that instead of showing the prompt.
		if (allowAutomaticSelection && this.currentDevice)
			return true;

		if (emulators.length === 0) {
			return false;
		}

		const cancellationTokenSource = new vs.CancellationTokenSource();
		const waitingForRealDeviceSubscription = this.daemon.registerForDeviceAdded(() => {
			cancellationTokenSource.cancel();
			waitingForRealDeviceSubscription.dispose();
		});
		const selectedEmulator =
			await vs.window.showQuickPick(
				emulators,
				{
					matchOnDescription: true,
					placeHolder: "Connect a device or select an emulator to launch",
				},
				cancellationTokenSource.token);
		waitingForRealDeviceSubscription.dispose();

		if (selectedEmulator && selectedEmulator.device && selectedEmulator.device.type === "emulator-creator") {
			return this.createEmulator();
		} else if (selectedEmulator && selectedEmulator.device && selectedEmulator.device.type === "emulator") {
			return this.launchEmulator(selectedEmulator.device);
		} else {
			return !!this.currentDevice;
		}
	}

	private async createEmulator(): Promise<boolean> {
		// TODO: Allow user to create names when we let them customise the emulator type.
		// const name = await vs.window.showInputBox({
		// 	prompt: "Enter a name for your new Android Emulator",
		// 	validateInput: this.validateEmulatorName,
		// });
		// if (!name) bail() // Pressing ENTER doesn't work, but escape does, so if
		// no name, user probably wanted to cancel
		const name: string = undefined;
		const create = this.daemon.createEmulator(name);
		vs.window.withProgress({
			location: vs.ProgressLocation.Notification,
			title: `${`Creating emulator ${name ? name : ""}`.trim()}...`,
		}, () => create);
		const res = await create;
		if (res.success) {
			return this.launchEmulator({
				id: res.emulatorName,
				name: res.emulatorName,
				type: "emulator",
			});
		} else {
			vs.window.showErrorMessage(res.error);
			return false;
		}
	}

	private async getEmulatorItems(showOfflineStatus: boolean): Promise<PickableDevice[]> {
		const emulators: PickableDevice[] = (await this.getEmulators())
			.map((e) => ({
				alwaysShow: false,
				description: showOfflineStatus ? "Emulator (offline)" : e.id,
				device: {
					id: e.id,
					name: e.name,
					type: "emulator",
				},
				label: e.name,
			}));
		// Add an option to create a new emulator if the daemon supports it.
		if (this.daemon.capabilities.canCreateEmulators) {
			emulators.push({
				alwaysShow: true,
				device: { type: "emulator-creator" },
				label: "Create Android Emulator",
			});
		}
		return emulators;
	}

	private validateEmulatorName(input: string) {
		if (!emulatorNameRegex.test(input))
			return "Emulator names should contain only letters, numbers, dots, underscores and dashes";
	}

	private async launchEmulator(emulator: f.Emulator): Promise<boolean> {
		try {
			await vs.window.withProgress({
				location: vs.ProgressLocation.Notification,
			}, async (progress) => {
				progress.report({ message: `Launching ${emulator.name}...` });
				await this.daemon.launchEmulator(emulator.id);
				progress.report({ message: `Waiting for ${emulator.name} to connect...` });
				// Wait up to 60 seconds for emulator to launch.
				for (let i = 0; i < 120; i++) {
					await new Promise((resolve) => setTimeout(resolve, 500));
					if (this.currentDevice)
						return;
				}
				throw new Error("Emulator didn't connected within 60 seconds");
			});
		} catch (e) {
			vs.window.showErrorMessage(`Failed to launch emulator: ${e}`);
			return false;
		}
		// Wait an additional second to try and void some possible races.
		await new Promise((resolve) => setTimeout(resolve, 1000));
		return true;
	}
}

type PickableDevice = vs.QuickPickItem & { device: f.Device | f.Emulator | f.EmulatorCreator };
