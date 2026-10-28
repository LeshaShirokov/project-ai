/* Фото контакта: проверка файла и уменьшение на клиенте через canvas (квадрат ≤ 256 px, JPEG) */
(function (global) {
  'use strict';
  var PD = global.PD = global.PD || {};

  var TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  var MAX_FILE = 5 * 1024 * 1024; // 5 МБ исходного файла
  var SIDE = 256;
  var MAX_DATA_URL = 150000; // целевой размер результата, символов

  /** Возвращает текст ошибки или '' если файл подходит. */
  function validateFile(file) {
    if (!file) return 'Файл не выбран';
    if (TYPES.indexOf(String(file.type).toLowerCase()) === -1) return 'Поддерживаются только изображения JPG, PNG, WebP или GIF';
    if (!file.size) return 'Файл пустой';
    if (file.size > MAX_FILE) return 'Файл больше 5 МБ';
    return '';
  }

  /** Центральный квадрат исходника и итоговый размер (не увеличиваем маленькие картинки). */
  function cropRect(w, h, side) {
    side = side || SIDE;
    var s = Math.min(w, h);
    return { sx: Math.round((w - s) / 2), sy: Math.round((h - s) / 2), sSize: s, size: Math.max(1, Math.min(side, s)) };
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
      img.src = url;
    });
  }

  /** Файл → Promise<data:image/jpeg;base64,...>. */
  function process(file) {
    var err = validateFile(file);
    if (err) return Promise.reject(new Error(err));
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width, hgt = img.naturalHeight || img.height;
      if (!w || !hgt) throw new Error('Не удалось прочитать изображение');
      var r = cropRect(w, hgt);
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = r.size;
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Браузер не поддерживает обработку изображений');
      ctx.fillStyle = '#ffffff'; // у JPEG нет прозрачности
      ctx.fillRect(0, 0, r.size, r.size);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, r.sx, r.sy, r.sSize, r.sSize, 0, 0, r.size, r.size);
      var q = [0.85, 0.72, 0.6, 0.45], out = '';
      for (var i = 0; i < q.length; i++) {
        out = canvas.toDataURL('image/jpeg', q[i]);
        if (out.length <= MAX_DATA_URL) break;
      }
      if (!/^data:image\/jpeg;base64,/.test(out)) throw new Error('Не удалось сжать изображение');
      return out;
    });
  }

  PD.photo = { TYPES: TYPES, MAX_FILE: MAX_FILE, SIDE: SIDE, validateFile: validateFile, cropRect: cropRect, process: process };
})(window);
