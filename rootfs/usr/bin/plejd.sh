#!/usr/bin/with-contenv bashio

CONFIG_PATH=/data/options.json

SITE=$(jq --raw-output ".site" $CONFIG_PATH)
USERNAME=$(jq --raw-output ".username" $CONFIG_PATH)
PASSWORD=$(jq --raw-output ".password" $CONFIG_PATH)
MQTTBROKER=$(jq --raw-output ".mqttBroker" $CONFIG_PATH)
MQTTUSERNAME=$(jq --raw-output ".mqttUsername" $CONFIG_PATH)
MQTTPASSWORD=$(jq --raw-output ".mqttPassword" $CONFIG_PATH)

PLEJD_PATH=/data/plejd.json
PLEJD_CONFIG="{
  \"site\": \"$SITE\",
  \"username\": \"$USERNAME\",
  \"password\": \"$PASSWORD\",
  \"mqttBroker\": \"$MQTTBROKER\",
  \"mqttUsername\": \"$MQTTUSERNAME\",
  \"mqttPassword\": \"$MQTTPASSWORD\"
}
"

echo "$PLEJD_CONFIG" > $PLEJD_PATH

exec node /plejd/main.js