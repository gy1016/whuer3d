import { Time } from "./base/Time";
import { Canvas } from "./Canvas";
import { EngineSettings } from "./EngineSettings";
import { Renderer, WebGLRendererOptions } from "./render/Renderer";
import { Scene } from "./Scene";
import { Shader, ShaderPool, ShaderProgramPool } from "./shader";
import { Texture2D, Texture2DArray, TextureCube, TextureCubeFace } from "./texture";

ShaderPool.init();

export class Engine {
  private _settings: EngineSettings;
  private _canvas: Canvas;
  private _scene: Scene;
  private _isPaused: boolean = true;
  private _requestId: number;
  private _timeoutId: number;
  private _time: Time = new Time();
  private _animate = () => {
    this._requestId = requestAnimationFrame(this._animate);
    this.update();
  };

  get scene(): Scene {
    return this._scene;
  }

  _renderer: Renderer;

  /* @internal */
  _magentaTexture2D: Texture2D;
  /* @internal */
  _magentaTextureCube: TextureCube;
  /* @internal */
  _magentaTexture2DArray: Texture2DArray;
  /* @internal */
  _shaderProgramPools: ShaderProgramPool[] = [];

  /**
   * The canvas to use for rendering.
   */
  get canvas(): Canvas {
    return this._canvas;
  }

  get setting() {
    return this._settings;
  }

  /**
   * Whether the engine is paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Get the Time class.
   */
  get time(): Time {
    return this._time;
  }

  constructor(
    canvas: string | HTMLCanvasElement,
    engineSettings?: EngineSettings,
    webGLRendererOptions?: WebGLRendererOptions
  ) {
    const webCanvas = new Canvas(
      <HTMLCanvasElement>(typeof canvas === "string" ? document.getElementById(canvas) : canvas)
    );

    this._settings = engineSettings;

    const hardwareRenderer = new Renderer(webGLRendererOptions);
    hardwareRenderer.init(webCanvas);

    this._canvas = webCanvas;
    this.canvas.resizeByClientSize();
    this._renderer = hardwareRenderer;
    this._initialScene();
  }

  private _initialScene() {
    const scene = new Scene(this);
    this._scene = scene;

    // ???????????????????????????
    const magentaPixel = new Uint8Array([255, 255, 255, 255]);
    const magentaTexture2D = new Texture2D(this, 1, 1);
    magentaTexture2D.setPixelBuffer(magentaPixel, 1, 1);

    const magentaTextureCube = new TextureCube(this, 1);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveX, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeX, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveY, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeY, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveZ, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeZ, magentaPixel);

    this._magentaTexture2D = magentaTexture2D;
    this._magentaTextureCube = magentaTextureCube;

    scene._initial();
  }

  /**
   * @internal
   */
  _getShaderProgramPool(shader: Shader): ShaderProgramPool {
    const index = shader._shaderId;
    const shaderProgramPools = this._shaderProgramPools;
    // ?????????Shader????????????ShaderProgramPools
    let pool = shaderProgramPools[index];
    if (!pool) {
      const length = index + 1;
      if (length < shaderProgramPools.length) {
        shaderProgramPools.length = length;
      }
      shaderProgramPools[index] = pool = new ShaderProgramPool();
    }
    return pool;
  }

  _render() {
    const camera = this.scene.camera;
    camera.render();
  }

  update(): void {
    // ! ??????????????????????????????????????????
    const time = this._time;
    const deltaTime = time.deltaTime;
    const scene = this.scene;
    // TODO: ??????????????????????????????
    scene.camera._orbitControl.onUpdate(deltaTime);

    time.tick();

    this._render();
  }

  /**
   * Pause the engine.
   */
  pause(): void {
    this._isPaused = true;
    cancelAnimationFrame(this._requestId);
    clearTimeout(this._timeoutId);
  }

  /**
   * Resume the engine.
   */
  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.time.reset();
    this._requestId = requestAnimationFrame(this._animate);
  }

  /**
   * Execution engine loop.
   */
  run(): void {
    this.resume();
  }
}
