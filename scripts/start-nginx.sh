#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the template and output file paths
TEMPLATE_FILE="/etc/nginx/templates/nginx.conf.template"
CONFIG_FILE="/etc/nginx/conf.d/default.conf"

# Check if DOMAIN_NAME is set
if [ -z "${DOMAIN_NAME}" ]; then
  echo "Error: DOMAIN_NAME environment variable is not set."
  exit 1
fi

# Export the variable so envsubst can use it
export DOMAIN_NAME

# Substitute the environment variables in the template file
# and create the final configuration file.
# Note: We are using `envsubst` on a specific variable to avoid replacing other
# dollar-sign variables in the nginx config, like $host and $request_uri.
envsubst '${DOMAIN_NAME}' < "${TEMPLATE_FILE}" > "${CONFIG_FILE}"

echo "NGINX configuration generated for domain: ${DOMAIN_NAME}"

# Start NGINX in the foreground
exec nginx -g 'daemon off;'
