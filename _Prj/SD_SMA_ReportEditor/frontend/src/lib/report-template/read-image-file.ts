/**
 * 将用户选取的本地图片读成 data URL，供模版图元 / 预设 `imageSrc` 使用。
 * （无独立上传接口时，内容与模板一并保存）
 */
export async function readImageFileAsDataUrl(
  file: File,
  opts?: { maxBytes?: number },
): Promise<string> {
  const maxBytes = opts?.maxBytes ?? 12 * 1024 * 1024;
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('请选择图片文件（JPEG/PNG/WebP/GIF/SVG 等）');
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`文件过大（超过 ${mb} MB），请换用更小的图片或先压缩`);
  }
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = typeof r.result === 'string' ? r.result : '';
      if (!s.startsWith('data:image')) {
        reject(new Error('读取结果不是可用的图片编码'));
        return;
      }
      resolve(s);
    };
    r.onerror = () => reject(new Error('读取文件失败'));
    r.readAsDataURL(file);
  });
}
