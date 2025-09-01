const { IPinfoWrapper } = require("node-ipinfo");

const ipinfoWrapper = new IPinfoWrapper(process.env.IPINFO);

const getGeolocation = async (ip) => {
    try {
        if (ip) {
            return await ipinfoWrapper.lookupIp(ip);
        }
        return await ipinfoWrapper.lookupIp();
    } catch (error) {
        console.error("Error fetching geolocation data from ipinfo.io:", error);
        return null;
    }
};

module.exports = {
    getGeolocation,
};
