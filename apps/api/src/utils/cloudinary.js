const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary.
 *
 * @param {Buffer} buffer  - Raw file data.
 * @param {string} folder  - Cloudinary folder path.
 * @param {object} [opts]  - Optional Cloudinary upload options (overrides defaults).
 *                           Callers that need resource_type:'raw' (e.g. exportWorker)
 *                           must pass it explicitly — default is 'image'.
 * @returns {Promise<object>} Full Cloudinary upload result (not just secure_url).
 */
async function uploadBuffer(buffer, folder, opts = {}) {
  const options = {
    folder,
    resource_type: 'image',
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
    ...opts,
  };

  // Raw uploads must not have image transformations applied
  if (options.resource_type === 'raw') {
    delete options.transformation;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
