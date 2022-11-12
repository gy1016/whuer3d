import { PrimitiveMesh } from "../core/mesh";
import { Ellipsoid } from "./Ellipsoid";
import { ImageMaterial } from "../core/material";
import { Shader, ShaderData, ShaderProperty } from "../core/shader";
import { Engine } from "../core/Engine";
import { EARTH_URL } from "../config";
import { Entity } from "../core/Entity";

export class RayCastedGlobe extends Entity {
  private static _shapeProperty: ShaderProperty = Shader.getPropertyByName("u_GlobeOneOverRadiiSquared");

  private _shape: Ellipsoid = Ellipsoid.Wgs84;

  /** The ellipsoid parameters corresponding to the sphere. */
  get shape() {
    return this._shape;
  }

  set shape(ellipsoid: Ellipsoid) {
    this._shape = ellipsoid;
  }

  /**
   * Create a cube grid and build a picture material based on the engine.
   * @param engine Engine instance.
   */
  constructor(engine: Engine) {
    super(
      "rayCastedGlobe",
      PrimitiveMesh.createCuboid(engine, 2 * 6378137.0, 2 * 6356752.314245, 2 * 6378137.0),
      new ImageMaterial(engine, Shader.find("rayCastedGlobe"), EARTH_URL)
    );
  }

  /**
   * Upload the parameters of the ellipsoid to the GPU.
   * @param shaderData Scene shaderdata.
   */
  uploadShaderData(shaderData: ShaderData): void {
    shaderData.setVector3(RayCastedGlobe._shapeProperty, this.shape.oneOverRadiiSquared);
  }
}
