
# PolyShadow.js

This is a simple library that draws precise soft shadows of rectangles and polygons composed of triangles using WebGL shaders. The shadows have the form of a solid-color Gaussian blur. The shader implementation is based on mathematical analysis. A closed form equation is used to compute the opacity at each pixel making this implementation both very precise and efficient. Curved paths are not and will not be supported.

![Shadow example](https://user-images.githubusercontent.com/18639794/100514118-4777d300-3172-11eb-8a69-f723fdc1c74e.png)

## How to use

The library provides a handful of functions which are divided between those drawing rectangle shadows and ones for other, more complex polygons.

### Rectangles

Rectangle shadows are both more common and much simpler to render. Because of this, the library provides a specialized shader just for these.

Initialize the shader with the following call, where `gl` is the WebGL context.

```javascript
var rectangleShader = PolyShadow.createRectangleShader(gl);
```

To draw a rectangle, use:

```javascript
PolyShadow.drawRectangle(gl, rectangleShader, rectangle, transformation, sigma, fillColor, bgColor, cutoff);
```

- `gl` is the WebGL context.
- `rectangleShader` is the object returned by `createRectangleShader`.
- `rectangle` is an array of 4 numbers - the bounds of the rectangle [left, bottom, right, top].
- `transformation` is an array of 16 real numbers - the 4x4 affine vertex transformation matrix. This matrix transforms the rectangle bounds to screen space coordinates and may facilitate the drawing of rotated rectangles as well.
- `sigma` is a real value that determines the intensity of the blurring. Must be greater than 0.
- `fillColor` (optional) is an array of 4 numbers, [red, green, blue, alpha] channels (0 to 1) of the shadow fill color. Defaults to [0, 0, 0, 1].
- `bgColor` (optional) is the same but for the outside color. Defaults to [0, 0, 0, 0].
- `cutoff` (optional) is the threshold opacity, below which pixels are not drawn at all. Must be greater than 0. Defaults to 1/512, roughly the highest value that rounds to 0 in a 8-bits/channel representation.

When the shader is no longer needed, it may be deinitialized by

```javascript
PolyShadow.deleteRectangleShader(gl, rectangleShader);
```

### Polygons

To draw shadows of arbitrary polygons, you need to supply them in the form of a triangle mesh. The triangles must not overlap, or the shadow will end up more saturated in those areas. You must also make sure to configure WebGL properly and use the right blending mode (see [below](#Considerations)).

Initialize the shader with the following call, where `gl` is the WebGL context.

```javascript
var triangleShader = PolyShadow.createTriangleShader(gl);
```

Create a triangle mesh using the following call. `triangles` is an array of real numbers. Every 6 values represent the coordinates of a single triangle `[ax, ay, bx, by, cx, cy]`.

```javascript
var triangleMesh = PolyShadow.createTriangleMesh(gl, triangles);
```

To draw the mesh, use:

```javascript
PolyShadow.drawTriangleMesh(gl, triangleShader, triangleMesh, transformation, sigma, fillColor, bgColor, cutoff);
```

- `gl` is the WebGL context.
- `triangleShader` is the object returned by `createTriangleShader`.
- `triangleMesh` is the object created by `createTriangleMesh`.
- The rest of the arguments are exactly same as in the [`drawRectangle`](#Rectangles) function.

When the shader or mesh is no longer needed, it may be deinitialized, respectively, by

```javascript
PolyShadow.deleteTriangleShader(gl, triangleShader);
PolyShadow.deleteTriangleMesh(gl, triangleMesh);
```

## Considerations

There are some pitfalls that may cause suboptimal results when the library is used incorrectly.

### Blending and depth test

When drawing triangle meshes, WebGL must be cofigured correctly to make sure that individual triangles do not interfere with one another.

![Example of incorrect blending](https://user-images.githubusercontent.com/18639794/100514216-0b913d80-3173-11eb-80dc-5f75fae34760.png)

Depth testing prevents drawing multiple triangles at the same position since they all have the same depth, so it should be disabled by

```javascript
gl.disable(gl.DEPTH_TEST);
```

The shadows of individual triangles must be summed together, so a form of additive blending has to be used, in most cases this one:

```javascript
gl.enable(gl.BLEND);
gl.blendEquation(gl.FUNC_ADD);
gl.blendFunc(gl.ONE, gl.ONE);
```

The supplied background and fill colors must be selected in accordance with this blending scheme.

Unfortunately, subtractive blending cannot be achieved in WebGL, so a black-on-white shadow cannot be drawn directly, but several workarounds are available, such as
- using an intermediate frame buffer,
- drawing a black-on-transparent shadow as in the [example](example.html),
- inverting the color buffer using a white rectangle and `gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ZERO);`

### Blending artifacts

When the shadows of many different triangles occupy the same area, banding artifacts may appear in certain cases. This is not due to imprecision of the used technique, but because the small values get heavily rounded in the 8-bit-per-channel color buffer before being blended together.

![Example of banding](https://user-images.githubusercontent.com/18639794/100514121-4c3c8700-3172-11eb-9dce-0f757eabbc81.png)

To avoid this, it is necessary to use a floating-point frame buffer in those cases, where this issue manifests. If it is not available, a more complex scheme can be utilized involving multiple color channels used for different magnitudes.
