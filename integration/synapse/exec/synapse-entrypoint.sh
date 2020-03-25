#!/bin/bash

# Ensure data dirs exist
mkdir -p /opt/synapse/data/log
mkdir -p /opt/synapse/data/keys

/opt/synapse/venv/bin/python /usr/local/bin/render_config_template.py
/opt/synapse/venv/bin/python -m synapse.app.homeserver --config-path /opt/synapse/config/synapse.yaml --generate-keys
exec /opt/synapse/venv/bin/python -m synapse.app.homeserver --config-path /opt/synapse/config/synapse.yaml
