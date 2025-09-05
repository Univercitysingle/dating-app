const { IPinfoWrapper } = require("node-ipinfo");

const ipinfoWrapper = new IPinfoWrapper(process.env.IPINFO);

const getGeolocation = async (ip) => {
    // If no IP is provided, or if it's a local/internal IP, don't lookup.
    // The `isBogon` check handles internal/private IPs.
    if (!ip) {
        return null;
    }
    try {
        const isBogon = await ipinfoWrapper.isBogon(ip);
        if (isBogon) {
            return null; // Don't lookup bogon IPs
        }
        return await ipinfoWrapper.lookupIp(ip);
    } catch (error) {
        // Log the error but don't crash the app
        console.error(`Error fetching geolocation data for IP ${ip}:`, error);
        return null;
    }
};

module.exports = {
    getGeolocation,
};
