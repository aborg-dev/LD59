// Stub canvas getContext for Phaser's module-level init checks.
// Phaser calls getContext('2d') at import time to detect features like
// inverse alpha. In jsdom there's no real canvas, so we return a minimal
// stub that satisfies those checks.

const proto = HTMLCanvasElement.prototype;
const origGetContext = proto.getContext;

proto.getContext = function (type: string, ...args: unknown[]) {
  if (type === "2d") {
    // Minimal CanvasRenderingContext2D stub
    const imageData = {
      data: new Uint8ClampedArray(4),
    };
    return {
      fillStyle: "",
      fillRect() {},
      getImageData() {
        return imageData;
      },
      putImageData() {},
      createImageData() {
        return imageData;
      },
      setTransform() {},
      drawImage() {},
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      stroke() {},
      translate() {},
      scale() {},
      rotate() {},
      arc() {},
      fill() {},
      measureText() {
        return { width: 0 };
      },
      clearRect() {},
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
  }
  if (type === "webgl" || type === "webgl2") {
    // Return null — Phaser HEADLESS mode doesn't need WebGL
    return null;
  }
  return origGetContext.call(this, type, ...args);
} as typeof proto.getContext;

// Patch HTMLImageElement so that setting src fires onload for data URLs.
// Phaser's TextureManager.addBase64 relies on Image.onload to fire for its
// default textures (__DEFAULT, __MISSING, __WHITE). jsdom's Image doesn't
// load data URLs, so the TextureManager never becomes ready without this.
const imgProto = HTMLImageElement.prototype;
const origSrcDesc =
  Object.getOwnPropertyDescriptor(imgProto, "src") ??
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(imgProto), "src");
const origSrcSet = origSrcDesc?.set;

Object.defineProperty(imgProto, "src", {
  get: origSrcDesc?.get,
  set(value: string) {
    origSrcSet?.call(this, value);
    // Fire onload asynchronously like a real image load
    setTimeout(() => {
      if (typeof this.onload === "function") {
        Object.defineProperty(this, "complete", {
          value: true,
          configurable: true,
        });
        Object.defineProperty(this, "naturalWidth", {
          value: 1,
          configurable: true,
        });
        Object.defineProperty(this, "naturalHeight", {
          value: 1,
          configurable: true,
        });
        this.onload(new Event("load"));
      }
    }, 0);
  },
  configurable: true,
  enumerable: true,
});
