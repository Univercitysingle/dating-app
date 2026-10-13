const { IPinfoWrapper } = require("node-ipinfo");
const { buildLogger } = require('../utils/logger');
const log = buildLogger('ipinfo-service');

const ipinfoWrapper = new IPinfoWrapper(process.env.IPINFO);

const getGeolocation = async (ip) => {
    // If no IP is provided, or if it's a local/internal IP, don't lookup.
    // The `isBogon` check handles internal/private IPs.
    if (!ip) {
        return null;
    }
    try {
        log.info({ message: 'Looking up IP geolocation', ip });
        const result = await ipinfoWrapper.lookupIp(ip);
        log.info({ message: 'IP geolocation lookup successful', ip });
        return result;
    } catch (error) {
        // Log the error but don't crash the app
        log.error({
            message: `Error fetching geolocation data for IP ${ip}`,
            error: error.message,
            stack: error.stack
        });
        return null;
    }
};

module.exports = {
    getGeolocation,
};
