/**
 * Compresses an image file in the browser using HTML5 Canvas
 * ensuring the resulting JPEG file is <= maxKB (default 20 KB).
 *
 * @param {File} file - Original user-uploaded file
 * @param {number} maxKB - Target maximum size in KB (default 20)
 * @returns {Promise<{ file: File, previewUrl: string, sizeKb: number }>}
 */
export async function compressImage(file, maxKB = 20) {
  const maxBytes = maxKB * 1024;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));

      img.onload = () => {
        // Initial max dimension
        let maxDim = 360;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Quality iteration
        const qualities = [0.85, 0.72, 0.58, 0.45, 0.35, 0.22];

        const tryQuality = (idx) => {
          const q = qualities[idx] !== undefined ? qualities[idx] : 0.2;
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error('Canvas to blob compression failed'));
              }

              // If size is <= maxBytes or we reached lowest quality
              if (blob.size <= maxBytes || idx >= qualities.length - 1) {
                // If still above 20KB at lowest quality, downscale dimensions
                if (blob.size > maxBytes && width > 180) {
                  width = Math.round(width * 0.75);
                  height = Math.round(height * 0.75);
                  canvas.width = width;
                  canvas.height = height;
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(0, 0, width, height);
                  ctx.drawImage(img, 0, 0, width, height);
                  tryQuality(0);
                  return;
                }

                const compressedFile = new File(
                  [blob],
                  file.name.replace(/\.[^/.]+$/, '') + '.jpg',
                  { type: 'image/jpeg' }
                );

                const previewUrl = URL.createObjectURL(blob);
                resolve({
                  file: compressedFile,
                  previewUrl,
                  sizeKb: parseFloat((blob.size / 1024).toFixed(1)),
                });
              } else {
                tryQuality(idx + 1);
              }
            },
            'image/jpeg',
            q
          );
        };

        tryQuality(0);
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}
