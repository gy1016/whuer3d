import { MathUtil, Matrix, Vector2, Vector3, Vector4 } from "../math";
import { BoolUpdateFlag } from "./BoolUpdateFlag";
import { deepClone, ignoreClone } from "./clone";
import { Engine } from "./Engine";
import { RenderPipeline } from "./render";
import { Shader, ShaderData, ShaderDataGroup } from "./shader";
import { Transform } from "./Transform";
import { OrbitControl } from "../controls";
import { Ellipsoid } from "../geographic";
import { Logger } from "./base";

export class Camera {
  /** Shader data. */
  readonly shaderData: ShaderData = new ShaderData(ShaderDataGroup.Camera);

  _orbitControl: OrbitControl;

  private _engine: Engine;
  private _level: number = 2;
  private _isProjMatSetting = false;
  private _nearClipPlane: number = 0.1;
  private _farClipPlane: number = 100;
  private _fieldOfView: number = 45;
  private _isProjectionDirty = true;
  private _customAspectRatio: number | undefined = undefined;
  private _lastCameraPos: Vector3 = new Vector3();

  @ignoreClone
  private _transform: Transform;
  @ignoreClone
  private _isViewMatrixDirty: BoolUpdateFlag;
  @ignoreClone
  _renderPipeline: RenderPipeline;
  @deepClone
  private _projectionMatrix: Matrix = new Matrix();
  @deepClone
  private _viewMatrix: Matrix = new Matrix();
  @deepClone
  private _mvpMatrix: Matrix = new Matrix();
  @deepClone
  private _viewport: Vector4 = new Vector4(0, 0, 1, 1);
  @deepClone
  private _lastAspectSize: Vector2 = new Vector2(0, 0);

  private static _vpMatrixProperty = Shader.getPropertyByName("u_MvpMat");
  // 我这个逆矩阵是忽略了平移参数的，只考虑方向
  private static _invVPMatrixProperty = Shader.getPropertyByName("u_InvVPMat");
  // 用于光线追踪求解射线与椭球的一元二次方程
  private static _cameraPositionProperty = Shader.getPropertyByName("u_CameraPos");
  private static _cameraPosSquaredProperty = Shader.getPropertyByName("u_CameraPosSquared");
  private static _cameraFarPlaneProperty = Shader.getPropertyByName("u_Far");
  // 用于大气层的MVP矩阵
  private static _atmosphereMvpMatProperty = Shader.getPropertyByName("u_AtmoshpereMvpMat");

  get engine() {
    return this._engine;
  }

  // ! TODO: 不能超过指定层级还没做
  get level() {
    const cameraPos = MathUtil.rightToGeographic(this.transform.worldPosition);
    const lastCameraPos = this._lastCameraPos;

    if (Vector3.equals(cameraPos, lastCameraPos)) return this._level;
    this._lastCameraPos = cameraPos.clone();

    const cameraPosSquared = cameraPos.clone().multiply(cameraPos);
    const normalDir = new Vector3(0, 0, 0).clone().subtract(cameraPos).normalize();

    const i = MathUtil.rayIntersectEllipsoid(
      cameraPos,
      cameraPosSquared,
      normalDir,
      Ellipsoid.Wgs84.oneOverRadiiSquared
    );

    const h = i.near;

    Logger.debug(`相机的位置x:${cameraPos.x},y:${cameraPos.y},z:${cameraPos.z}, 距离表面高度h:${h}`);

    // TODO: 这个该用视锥体进行数学计算
    // ! It's ugly but useful!
    if (h <= 100) {
      this._level = 19;
    } else if (h <= 300) {
      this._level = 18;
    } else if (h <= 660) {
      this._level = 17;
    } else if (h <= 1300) {
      this._level = 16;
    } else if (h <= 2600) {
      this._level = 15;
    } else if (h <= 6400) {
      this._level = 14;
    } else if (h <= 13200) {
      this._level = 13;
    } else if (h <= 26000) {
      this._level = 12;
    } else if (h <= 67985) {
      this._level = 11;
    } else if (h <= 139780) {
      this._level = 10;
    } else if (h <= 250600) {
      this._level = 9;
    } else if (h <= 380000) {
      this._level = 8;
    } else if (h <= 640000) {
      this._level = 7;
    } else if (h <= 1280000) {
      this._level = 6;
    } else if (h <= 2600000) {
      this._level = 5;
    } else if (h <= 6100000) {
      this._level = 4;
    } else if (h <= 11900000) {
      this._level = 3;
    } else {
      this._level = 2;
    }

    return this._level;
  }

  get transform() {
    return this._transform;
  }

  /**
   * Near clip plane - the closest point to the camera when rendering occurs.
   */
  get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  set nearClipPlane(value: number) {
    this._nearClipPlane = value;
  }

  /**
   * Far clip plane - the furthest point to the camera when rendering occurs.
   */
  get farClipPlane(): number {
    return this._farClipPlane;
  }

  set farClipPlane(value: number) {
    this._farClipPlane = value;
  }

  /**
   * The camera's view angle. activating when camera use perspective projection.
   */
  get fieldOfView(): number {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    this._fieldOfView = value;
  }

  /**
   * Aspect ratio. The default is automatically calculated by the viewport's aspect ratio. If it is manually set,
   * the manual value will be kept. Call resetAspectRatio() to restore it.
   */
  get aspectRatio(): number {
    const canvas = this.engine.canvas;
    return this._customAspectRatio ?? (canvas.width * this._viewport.z) / (canvas.height * this._viewport.w);
  }

  set aspectRatio(value: number) {
    this._customAspectRatio = value;
  }

  /**
   * Viewport, normalized expression, the upper left corner is (0, 0), and the lower right corner is (1, 1).
   * @remarks Re-assignment is required after modification to ensure that the modification takes effect.
   */
  get viewport(): Vector4 {
    return this._viewport;
  }

  set viewport(value: Vector4) {
    if (value !== this._viewport) {
      this._viewport.copyFrom(value);
    }
  }

  /**
   * View matrix.
   */
  get viewMatrix(): Readonly<Matrix> {
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      // Ignore scale.
      Matrix.rotationTranslation(
        this._transform.worldRotationQuaternion,
        this._transform.worldPosition,
        this._viewMatrix
      );
      this._viewMatrix.invert();
    }
    return this._viewMatrix;
  }

  /**
   * The projection matrix is calculated by the relevant parameters of the camera by default.
   * If it is manually set, the manual value will be maintained. Call resetProjectionMatrix() to restore it.
   */
  set projectionMatrix(value: Matrix) {
    this._projectionMatrix = value;
    this._isProjMatSetting = true;
  }

  get projectionMatrix(): Matrix {
    const canvas = this.engine.canvas;
    if (
      (!this._isProjectionDirty || this._isProjMatSetting) &&
      this._lastAspectSize.x === canvas.width &&
      this._lastAspectSize.y === canvas.height
    ) {
      return this._projectionMatrix;
    }
    this._isProjectionDirty = false;
    this._lastAspectSize.x = canvas.width;
    this._lastAspectSize.y = canvas.height;
    const aspectRatio = this.aspectRatio;

    Matrix.perspective(
      MathUtil.degreeToRadian(this._fieldOfView),
      aspectRatio,
      this._nearClipPlane,
      this._farClipPlane,
      this._projectionMatrix
    );

    return this._projectionMatrix;
  }

  get mvpMatrix(): Matrix {
    // ! 这里乘了一个将地理坐标系模型转换到右手坐标系的变换矩阵
    const geoModelMatrix = new Matrix(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, this._mvpMatrix);
    this._mvpMatrix.multiply(geoModelMatrix);
    return this._mvpMatrix;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    this._transform = new Transform(this);
    this._isViewMatrixDirty = this._transform.registerWorldChangeFlag();
    this._orbitControl = new OrbitControl(this);
    this._renderPipeline = new RenderPipeline(this);
  }

  /**
   * Upload camera-related shader data.
   */
  private _updateShaderData(): void {
    const shaderData = this.shaderData;

    const vpMat = new Matrix();
    // 注意顺序：perspect * view * model
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, vpMat);

    const invVPMat = this.viewMatrix.clone();
    (invVPMat.elements[12] = 0), (invVPMat.elements[13] = 0), (invVPMat.elements[14] = 0);
    Matrix.multiply(this.projectionMatrix, invVPMat, invVPMat);
    invVPMat.invert();

    const cameraPos = this.transform.worldPosition;
    const cameraPosSquared = new Vector3();
    Vector3.multiply(cameraPos, cameraPos, cameraPosSquared);

    const atmosphereMvpMat = new Matrix();
    atmosphereMvpMat.elements[12] = this.viewMatrix.elements[12];
    atmosphereMvpMat.elements[13] = this.viewMatrix.elements[13];
    atmosphereMvpMat.elements[14] = this.viewMatrix.elements[14];
    Matrix.multiply(this.projectionMatrix, atmosphereMvpMat, atmosphereMvpMat);

    shaderData.setFloat(Camera._cameraFarPlaneProperty, this.farClipPlane);
    shaderData.setVector3(Camera._cameraPositionProperty, cameraPos);
    shaderData.setVector3(Camera._cameraPosSquaredProperty, cameraPosSquared);
    shaderData.setMatrix(Camera._vpMatrixProperty, vpMat);
    shaderData.setMatrix(Camera._invVPMatrixProperty, invVPMat);
    shaderData.setMatrix(Camera._atmosphereMvpMatProperty, atmosphereMvpMat);
  }

  /**
   * Convert world coordinates to NDC coordinates.
   * @param cartesian World coordinates in Cartesian coordinate system
   * @returns NDC coordinates
   */
  cartesianToNDC(cartesian: Vector3): Vector3 {
    const p = new Vector4(cartesian.x, cartesian.y, cartesian.z, 1);
    const res = this.mvpMatrix.multiplyVector4(p);
    const w = res.w;
    return new Vector3(res.x / w, res.y / w, res.z / w);
  }

  /**
   * Determine whether it is visible based on the tile coordinates and its corresponding NDC coordinates.
   * @param world The world coordinates of the point to be determined
   * @param ndcPos NDC coordinates of the point to be determined
   * @returns Is it visible
   */
  isWorldVisibleInDevice(world: Vector3, ndcPos: Vector3): boolean {
    const cameraPos = MathUtil.rightToGeographic(this.transform.worldPosition);
    const cameraPosSquared = cameraPos.clone().multiply(cameraPos);
    const normalDir = world.clone().subtract(cameraPos).normalize();

    const i = MathUtil.rayIntersectEllipsoid(
      cameraPos,
      cameraPosSquared,
      normalDir,
      Ellipsoid.Wgs84.oneOverRadiiSquared
    );

    if (i.intersects) {
      const pickVertice = cameraPos.clone().add(normalDir.scale(i.near));
      const length2Vertice = cameraPos.clone().subtract(world).length();
      const length2Pick = cameraPos.clone().subtract(pickVertice).length();
      // 首先确定这个点在正面
      if (length2Vertice < length2Pick + 5) {
        const res = ndcPos.x >= -1 && ndcPos.x <= 1 && ndcPos.y >= -1 && ndcPos.y <= 1;
        return res;
      }
    }

    return false;
  }

  /**
   * The upload method is triggered by render.
   */
  render(): void {
    this._updateShaderData();
    this._renderPipeline.render();
  }
}
