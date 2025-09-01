const { getGeolocation } = require('../services/ipinfoService');
const User = require('../models/User');

const geolocationMiddleware = async (req, res, next) => {
    if (!req.user) {
        return next();
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (req.user.location && req.user.location.locationLastUpdatedAt && req.user.location.locationLastUpdatedAt > twentyFourHoursAgo) {
        return next();
    }

    const ip = req.ip;
    if (!ip) {
        return next();
    }

    try {
        const geo = await getGeolocation(ip);
        if (geo && geo.loc) {
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
                    'location.locationLastUpdatedAt': now,
                }
            );
        }
    } catch (error) {
        console.error('Error in geolocation middleware:', error);
    }

    next();
};

module.exports = geolocationMiddleware;
