const si = require('systeminformation');

const getMonitoringDataForSocket = async () => {
  const cpuData = await si.cpu();
  const memData = await si.mem();
  const fsSizeData = await si.fsSize();

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
        db: 'N/A',
        collections: 'N/A',
        objects: 'N/A',
        avgObjSize: 'N/A',
        dataSize: 'N/A',
        storageSize: 'N/A',
        totalSize: 'N/A',
        indexes: 'N/A',
        indexSize: 'N/A',
    },
    s3: {
      // Placeholder for S3 data
      bucketName: process.env.AWS_S3_BUCKET_NAME,
      totalSize: 'N/A',
      usedCapacity: 'N/A',
      dailyDownload: 'N/A',
    }
  };

  return data;
};

const getMonitoringData = async (req, res) => {
  try {
    const data = await getMonitoringDataForSocket();
    res.json(data);
  } catch (error) {
    console.error('Error fetching monitoring data:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring data' });
  }
};

module.exports = {
  getMonitoringData,
  getMonitoringDataForSocket,
};
