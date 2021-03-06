const EventEmitter = require('events');

const Configuration = require('./Configuration');
const Logger = require('./Logger');
const PlejdApi = require('./PlejdApi');
// const PlejdBLE = require('./PlejdBLE');
const PlejdBLEHandler = require('./PlejdBLEHandler');
const MqttClient = require('./MqttClient');
const SceneManager = require('./SceneManager');
const DeviceRegistry = require('./DeviceRegistry');

const logger = Logger.getLogger('plejd-main');

class PlejdAddon extends EventEmitter {
  bleInitTimeout;
  config;
  deviceRegistry;
  plejdApi;
  plejdBLEHandler;
  mqttClient;
  sceneManager;

  constructor() {
    super();

    this.config = Configuration.getOptions();
    this.deviceRegistry = new DeviceRegistry();

    this.plejdApi = new PlejdApi(this.deviceRegistry);
    this.plejdBLEHandler = new PlejdBLEHandler(this.deviceRegistry);
    this.sceneManager = new SceneManager(this.deviceRegistry, this.plejdBLEHandler);
    this.mqttClient = new MqttClient(this.deviceRegistry);
  }

  async init() {
    logger.info('Main Plejd addon init()...');

    await this.plejdApi.init();
    this.sceneManager.init();

    ['SIGINT', 'SIGHUP', 'SIGTERM'].forEach((signal) => {
      process.on(signal, () => {
        this.mqttClient.disconnect(() => process.exit(0));
      });
    });

    this.mqttClient.on('connected', () => {
      try {
        logger.verbose('connected to mqtt.');
        this.mqttClient.sendDiscoveryToHomeAssistant();
      } catch (err) {
        logger.error('Error in MqttClient.connected callback in main.js', err);
      }
    });

    // subscribe to changes from HA
    this.mqttClient.on('stateChanged', (device, command) => {
      try {
        const deviceId = device.id;

        if (device.typeName === 'Scene') {
          // we're triggering a scene, lets do that and jump out.
          // since scenes aren't "real" devices.
          this.sceneManager.executeScene(device.id);
          return;
        }

        let state = 'OFF';
        let commandObj = {};

        if (typeof command === 'string') {
          // switch command
          state = command;
          commandObj = {
            state,
          };

          // since the switch doesn't get any updates on whether it's on or not,
          // we fake this by directly send the updateState back to HA in order for
          // it to change state.
          this.mqttClient.updateState(deviceId, {
            state: state === 'ON' ? 1 : 0,
          });
        } else {
          // eslint-disable-next-line prefer-destructuring
          state = command.state;
          commandObj = command;
        }

        if (state === 'ON') {
          this.plejdBLEHandler.turnOn(deviceId, commandObj);
        } else {
          this.plejdBLEHandler.turnOff(deviceId, commandObj);
        }
      } catch (err) {
        logger.error('Error in MqttClient.stateChanged callback in main.js', err);
      }
    });

    this.mqttClient.init();

    this.plejdBLEHandler.on('connected', () => {
      logger.info('Bluetooth connected. Plejd BLE up and running!');
    });
    this.plejdBLEHandler.on('reconnecting', () => {
      logger.info('Bluetooth reconnecting...');
    });

    // subscribe to changes from Plejd
    this.plejdBLEHandler.on('stateChanged', (deviceId, command) => {
      try {
        this.mqttClient.updateState(deviceId, command);
      } catch (err) {
        logger.error('Error in PlejdService.stateChanged callback in main.js', err);
      }
    });

    this.plejdBLEHandler.on('sceneTriggered', (deviceId, sceneId) => {
      try {
        this.mqttClient.sceneTriggered(sceneId);
      } catch (err) {
        logger.error('Error in PlejdService.sceneTriggered callback in main.js', err);
      }
    });

    try {
      await this.plejdBLEHandler.init();
    } catch (err) {
      logger.error('Failed init() of BLE. Starting reconnect loop.');
      await this.plejdBLEHandler.startReconnectPeriodicallyLoop();
    }
    logger.info('Main init done');
  }
}

module.exports = PlejdAddon;
