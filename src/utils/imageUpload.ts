/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Đọc ảnh người dùng chọn (từ thư viện hoặc camera), thu nhỏ về tối đa `maxSize` px cạnh dài nhất
 * và nén JPEG để lưu thẳng vào SQLite dưới dạng data URL (~30-80KB / ảnh), không cần máy chủ lưu ảnh.
 */
export async function fileToResizedDataUrl(file: File, maxSize = 640, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn một tệp ảnh.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 20MB).');

  const source = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  // Nền trắng cho ảnh PNG/GIF có vùng trong suốt (JPEG không có kênh alpha)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source.element, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(file: File): Promise<{ element: CanvasImageSource; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ element: img, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG.'));
    };
    img.src = url;
  });
}
