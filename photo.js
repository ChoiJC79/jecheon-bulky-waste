function capturePhoto(file, { maxSize = 1024, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("파일이 없습니다."));
    if (!file.type.startsWith("image/")) return reject(new Error("이미지 파일만 첨부할 수 있습니다."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 읽을 수 없습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("사진을 처리할 수 없습니다."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
