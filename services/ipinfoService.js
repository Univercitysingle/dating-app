const IPinfoWrapper = require("node-ipinfo");

const ipinfoWrapper = new IPinfoWrapper(process.env.IPINFO);

const getGeolocation = async (ip) => {
    try {
        const response = await ipinfoWrapper.lookupIp(ip);
        return response;
    } catch (error) {
        console.error("Error fetching geolocation data from ipinfo.io:", error);
        return null;
    }
};

module.exports = {
    getGeolocation,
};
