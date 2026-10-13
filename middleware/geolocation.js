const { getGeolocation } = require('../services/ipinfoService');
const User = require('../models/User');

const geolocationMiddleware = async (req, res, next) => {
    if (!req.user) {
        return next();
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // If location was updated recently, skip.
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

            // Atomically update the user's location data without loading the full document.
            // This is more efficient and prevents validation errors on unrelated fields
            // from crashing the request.
            await User.updateOne(
                { uid: req.user.uid },
                {
                    $set: {
                        lastLoginIp: ip,
                        'location.type': 'Point',
                        'location.coordinates': [longitude, latitude],
                        'location.city': city,
                        'location.region': region,
                        'location.country': country,
                        'location.locationLastUpdatedAt': now,
                    }
                }
            );
        }
    } catch (error) {
        // Log the error but do not crash the server, as this is a background task.
        console.error('Error in geolocation middleware during DB update:', error);
    }

    next();
};

module.exports = geolocationMiddleware;
