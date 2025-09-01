const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const mongoose = require('mongoose');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

const getMonitoringData = async (req, res) => {
  try {
    const cpuData = await si.cpu();
    const memData = await si.mem();
    const fsSizeData = await si.fsSize();
    const dbStats = await mongoose.connection.db.stats();

    const data = {
      cpu: {
        manufacturer: cpuData.manufacturer,
        brand: cpuData.brand,
        speed: cpuData.speed,
        cores: cpuData.cores,
        physicalCores: cpuData.physicalCores,
        load: await si.currentLoad(),
      },
      memory: {
        total: memData.total,
        free: memData.free,
        used: memData.used,
        active: memData.active,
        available: memData.available,
      },
      storage: fsSizeData.map(disk => ({
        fs: disk.fs,
        type: disk.type,
        size: disk.size,
        used: disk.used,
        available: disk.available,
        use: disk.use,
        mount: disk.mount,
      })),
      database: {
        db: dbStats.db,
        collections: dbStats.collections,
        objects: dbStats.objects,
        avgObjSize: dbStats.avgObjSize,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        totalSize: dbStats.totalSize,
        indexes: dbStats.indexes,
        indexSize: dbStats.indexSize,
      },
      s3: {
        // Placeholder for S3 data
        bucketName: process.env.AWS_S3_BUCKET_NAME,
        totalSize: 'N/A',
        usedCapacity: 'N/A',
        dailyDownload: 'N/A',
      }
    };

    res.json(data);
  } catch (error) {
    console.error('Error fetching monitoring data:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring data' });
  }
};

router.get('/', adminAuthMiddleware, getMonitoringData);

module.exports = router;
