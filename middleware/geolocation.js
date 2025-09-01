const { getGeolocation } = require('../services/ipinfoService');
const User = require('../models/User');

const geolocationMiddleware = async (req, res, next) => {
    if (!req.user) {
        return next();
    }

    const ip = req.ip;
    if (!ip) {
        return next();
    }

    try {
        const geo = await getGeolocation(ip);
        if (geo) {
            const { city, region, country, loc } = geo;
            const [latitude, longitude] = loc.split(',').map(Number);

            await User.findOneAndUpdate(
                { uid: req.user.uid },
                {
                    lastLoginIp: ip,
                    'location.city': city,
                    'location.region': region,
                    'location.country': country,
                    'location.coordinates': [longitude, latitude],
                }
            );
        }
    } catch (error) {
        console.error('Error in geolocation middleware:', error);
    }

    next();
};

module.exports = geolocationMiddleware;
