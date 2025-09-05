const { IPinfoWrapper } = require("node-ipinfo");

const ipinfoWrapper = new IPinfoWrapper(process.env.IPINFO);

const getGeolocation = async (ip) => {
    if (!ip) {
        return null;
    }
    try {
        return await ipinfoWrapper.lookupIp(ip);
    } catch (error) {
        console.error(`Error fetching geolocation data for IP ${ip} from ipinfo.io:`, error);
        return null;
    }
};

module.exports = {
    getGeolocation,
};
