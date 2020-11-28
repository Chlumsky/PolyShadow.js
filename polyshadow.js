
/**
 * @file PolyShadow
 * @version 1.0
 * @description
 *     This library facilitates drawing shadows of rectangles and other polygons in a WebGL context.
 *     The shadows are in the form of a precise Gaussian blur.
 *     The implementation is based on a mathematical equation and has constant complexity.
 *     To get proper results, polygon triangles must not overlap and must be combined using additive blending without depth testing.
 *     Using a floating-point frame buffer may be necessary to avoid artifacts resulting from blending many small triangles.
 * @author Viktor Chlumsky
 * @copyright Viktor Chlumsky 2020
 * @license MIT
 */

(function(PolyShadow) {

    function invErf(x) {
        var ln = Math.log(1.0-x*x);
        var g = 4.546884979448284327344753864428+0.5*ln;
        return Math.sign(x)*Math.sqrt(Math.sqrt(g*g-7.1422302240762540265936395279122*ln)-g);
    }

    function computeBorder(sigma, cutoff) {
        var polarCutoff = 2.0*cutoff-1.0;
        return -Math.SQRT2*sigma*invErf(polarCutoff);
    }

    /**
     * Creates a rectangle shadow shader and a rectangle vertex buffer for subsequent drawRectangle.
     * Should be deleted by deleteRectangleShader.
     * GL state changes: gl.ARRAY_BUFFER
     * @param {WebGLRenderingContext} gl The WebGL context
     */
    PolyShadow.createRectangleShader = function(gl) {
        const vertexSrc = `
#version 100
precision mediump float;
attribute vec2 unitCoord;
varying float l, b, r, t;
uniform vec4 rect;
uniform mat4 transformation;
uniform float invSigma;
uniform float border;

void main() {
    vec2 coord = mix(rect.xy-border, rect.zw+border, unitCoord);
    l = invSigma*(rect[0]-coord.x);
    b = invSigma*(rect[1]-coord.y);
    r = invSigma*(rect[2]-coord.x);
    t = invSigma*(rect[3]-coord.y);
    gl_Position = transformation*vec4(coord, 0.0, 1.0);
}
`;
        const fragmentSrc = `
#version 100
precision mediump float;
varying float l, b, r, t;
uniform vec4 baseColor;
uniform vec4 colorVector;

float erf(float x) {
    float x2 = x*x;
    float ax2 = 0.14001228868666660600424949138612*x2;
    return sign(x)*sqrt(1.0-exp(-x2*(1.2732395447351626861510701069801+ax2)/(1.0+ax2)));
}

void main() {
    float fill = 0.25*(erf(r)-erf(l))*(erf(t)-erf(b));
    gl_FragColor = baseColor+fill*colorVector;
}
`;

        var vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexSrc);
        gl.compileShader(vs);
        var fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentSrc);
        gl.compileShader(fs);
        var program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, "unitCoord");
        gl.linkProgram(program);
        var uRect = gl.getUniformLocation(program, "rect");
        var uTransformation = gl.getUniformLocation(program, "transformation");
        var uInvSigma = gl.getUniformLocation(program, "invSigma");
        var uBorder = gl.getUniformLocation(program, "border");
        var uBaseColor = gl.getUniformLocation(program, "baseColor");
        var uColorVector = gl.getUniformLocation(program, "colorVector");
        gl.detachShader(program, vs);
        gl.detachShader(program, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0 ]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return {
            program: program,
            uRect: uRect,
            uTransformation: uTransformation,
            uInvSigma: uInvSigma,
            uBorder: uBorder,
            uBaseColor: uBaseColor,
            uColorVector: uColorVector,
            vbo: vbo
        };
    }

    /**
     * Deletes a rectangle shader when it's no longer needed.
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {Object} rectangleShader The rectangle shader created by createRectangleShader
     */
    PolyShadow.deleteRectangleShader = function(gl, rectangleShader) {
        gl.deleteBuffer(rectangleShader.vbo);
        gl.deleteProgram(rectangleShader.program);
    }

    /**
     * Draws a rectangle shadow (a solid-color blurred rectangle).
     * GL state changes: gl.useProgram, gl.ARRAY_BUFFER, gl.enableVertexAttribArray, gl.vertexAttribPointer
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {Object} rectangleShader The rectangle shader created by createRectangleShader
     * @param {number[]} rectangle An array of 4 floats, the rectangle's sides: [left, bottom, right, top]
     * @param {number[]} transformation A 4x4 vertex transformation matrix in the form of an array of 16 floats
     * @param {number} sigma The blur intensity (the sigma coefficient of the Gaussian distribution)
     * @param {number[]} fillColor The foreground color as an array of [r, g, b, a] - values between 0 and 1
     * @param {number[]} bgColor The background color (to be used in the outer portion of filled fragments) as an array of [r, g, b, a] - values between 0 and 1
     * @param {number} cutoff Even though the Gaussian distribution extends to infinity, it will be cut off when opacity is below this threshold
     */
    PolyShadow.drawRectangle = function(gl, rectangleShader, rectangle, transformation, sigma, fillColor = [0.0, 0.0, 0.0, 1.0], bgColor = [0.0, 0.0, 0.0, 0.0], cutoff = 1.0/512.0) {
        gl.useProgram(rectangleShader.program);
        gl.uniformMatrix4fv(rectangleShader.uTransformation, false, transformation);
        gl.uniform4f(rectangleShader.uRect, Math.min(rectangle[0], rectangle[2]), Math.min(rectangle[1], rectangle[3]), Math.max(rectangle[0], rectangle[2]), Math.max(rectangle[1], rectangle[3]));
        gl.uniform1f(rectangleShader.uInvSigma, 0.70710678118654752440084436210485/sigma);
        gl.uniform1f(rectangleShader.uBorder, computeBorder(sigma, cutoff));
        gl.uniform4fv(rectangleShader.uBaseColor, bgColor);
        gl.uniform4f(rectangleShader.uColorVector, fillColor[0]-bgColor[0], fillColor[1]-bgColor[1], fillColor[2]-bgColor[2], fillColor[3]-bgColor[3]);
        gl.bindBuffer(gl.ARRAY_BUFFER, rectangleShader.vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
    }

    /**
     * Creates a triangle shadow shader used to draw triangle mesh shadows.
     * Should be deleted by deleteTriangleShader.
     * @param {WebGLRenderingContext} gl The WebGL context
     */
    PolyShadow.createTriangleShader = function(gl) {
        const vertexSrc = `
#version 100
precision mediump float;
attribute vec4 varCoord;
attribute vec3 h;
attribute vec2 v;
attribute vec2 shift;
varying float l, m, r, b, t;
uniform mat4 transformation;
uniform float invSigma;
uniform float border;

void main() {
    vec2 borderShift = border*shift;
    l = invSigma*(h[0]+borderShift.x);
    m = invSigma*(h[1]+borderShift.x);
    r = invSigma*(h[2]+borderShift.x);
    b = invSigma*(v[0]+borderShift.y);
    t = invSigma*(v[1]+borderShift.y);
    gl_Position = transformation*vec4(varCoord.xy+border*varCoord.zw, 0.0, 1.0);
}
`;
        const fragmentSrc = `
#version 100
precision mediump float;
varying float l, m, r, b, t;
uniform vec4 baseColor;
uniform vec4 colorVector;

#define ROOT2 1.4142135623730950488016887242097
#define HALF_ROOT2 0.70710678118654752440084436210485
#define PI 3.1415926535897932384626433832795
#define SQRT_PI 1.7724538509055160272981674833411
#define SQRT_FOUR_PI 3.5449077018110320545963349666823
#define QUARTER_SQRT_PI 0.44311346272637900682454187083529
#define INVSQRT_TWO_PI 0.39894228040143267793994605993438

float erf(float x) {
    float x2 = x*x;
    float ax2 = 0.14001228868666660600424949138612*x2;
    return sign(x)*sqrt(1.0-exp(-x2*(1.2732395447351626861510701069801+ax2)/(1.0+ax2)));
}

float rightTriangleBlurSample(float l, float b, float r, float t) {
    float total = 0.0;
    float aspect = (r-l)/(t-b);
    float threshold = t+l/aspect;
    float a = -ROOT2*aspect;
    float m = ROOT2*l-a*t;
    float c = -0.25*erf(HALF_ROOT2*l);
    float sqa = a*a;
    float sqapi = sqa+PI;
    float rsapi = sqrt(sqapi);
    float irsapi = 1.0/rsapi;
    float rFac = QUARTER_SQRT_PI*irsapi;
    float erfYFac = INVSQRT_TWO_PI*rsapi;
    float erfConstFac = INVSQRT_TWO_PI*a*irsapi;
    if (l <= 0.0) {
        float lo = max(b, threshold), hi = max(t, threshold);
        float erfConst = erfConstFac*(m-SQRT_PI);
        total += (c-0.25)*(erf(0.5*ROOT2*hi)-erf(0.5*ROOT2*lo))+rFac*exp(0.5*(sqa+m*(SQRT_FOUR_PI-m))/sqapi)*(erf(erfYFac*hi+erfConst)-erf(erfYFac*lo+erfConst));
    }
    if (r >= 0.0) {
        float lo = min(b, threshold), hi = min(t, threshold);
        float erfConst = erfConstFac*(m+SQRT_PI);
        total += (c+0.25)*(erf(0.5*ROOT2*hi)-erf(0.5*ROOT2*lo))-rFac*exp(0.5*(sqa-m*(SQRT_FOUR_PI+m))/sqapi)*(erf(erfYFac*hi+erfConst)-erf(erfYFac*lo+erfConst));
    }
    return total;
}

void main() {
    float lSig = sign(l-m);
    float rSig = sign(r-m);
    float fill = (
        -lSig*rightTriangleBlurSample(lSig*m, b, lSig*l, t)
        +rSig*rightTriangleBlurSample(rSig*m, b, rSig*r, t)
    );
    gl_FragColor = baseColor+fill*colorVector;
}
`;

        var vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexSrc);
        gl.compileShader(vs);
        var fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentSrc);
        gl.compileShader(fs);
        var program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, "varCoord");
        gl.bindAttribLocation(program, 1, "h");
        gl.bindAttribLocation(program, 2, "v");
        gl.bindAttribLocation(program, 3, "shift");
        gl.linkProgram(program);
        var uTransformation = gl.getUniformLocation(program, "transformation");
        var uInvSigma = gl.getUniformLocation(program, "invSigma");
        var uBorder = gl.getUniformLocation(program, "border");
        var uBaseColor = gl.getUniformLocation(program, "baseColor");
        var uColorVector = gl.getUniformLocation(program, "colorVector");
        gl.detachShader(program, vs);
        gl.detachShader(program, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return {
            program: program,
            uTransformation: uTransformation,
            uInvSigma: uInvSigma,
            uBorder: uBorder,
            uBaseColor: uBaseColor,
            uColorVector: uColorVector
        };
    }

    /**
     * Deletes a triangle shader when it's no longer needed.
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {Object} triangleShader The triangle shader created by createTriangleShader
     */
    PolyShadow.deleteTriangleShader = function(gl, triangleShader) {
        gl.deleteProgram(triangleShader.program);
    }

    /**
     * Creates a drawable triangle mesh.
     * Its individual triangles must not overlap! (Unless this is intended)
     * GL state changes: gl.ARRAY_BUFFER, gl.ELEMENT_ARRAY_BUFFER
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {number[]} triangles An array of triangle coordinates - each triangle represented by six floats: [ax, ay, bx, by, cx, cy]
     */
    PolyShadow.createTriangleMesh = function(gl, triangles) {
        const aspectThreshold = 6.144;

        function Vector(x, y) {
            this.x = x;
            this.y = y;
        }

        function sub(a, b) {
            return new Vector(a.x-b.x, a.y-b.y);
        }

        function mul(s, v) {
            return new Vector(s*v.x, s*v.y);
        }

        function dot(a, b) {
            return a.x*b.x+a.y*b.y;
        }

        function cross(a, b) {
            return a.x*b.y-b.x*a.y;
        }

        function sqLength(v) {
            return v.x*v.x+v.y*v.y;
        }

        function sqr(x) {
            return x*x;
        }

        function inversesqrt(x) {
            return 1/Math.sqrt(x);
        }

        function normalize(v) {
            return mul(inversesqrt(sqLength(v)), v);
        }

        function lTransform(m, v) {
            return new Vector(m[0]*v.x+m[2]*v.y, m[1]*v.x+m[3]*v.y);
        }

        function rTransform(v, m) {
            return new Vector(v.x*m[0]+v.y*m[1], v.x*m[2]+v.y*m[3]);
        }

        var vertexData = [];
        var indices = [];
        var vertexCount = 0;
        var triangleCount = triangles.length/6;
        for (let i = 0; i < triangleCount; ++i) {
            var tmp;
            var a = new Vector(triangles[6*i+0], triangles[6*i+1]);
            var b = new Vector(triangles[6*i+2], triangles[6*i+3]);
            var c = new Vector(triangles[6*i+4], triangles[6*i+5]);
            // Swap b and c if triangle is clockwise
            if (cross(sub(b, a), sub(c, b)) < 0) {
                tmp = b; b = c; c = tmp;
            }
            // Reorder vertices so that ab is the longest edge
            var absl = sqLength(sub(b, a));
            var bcsl = sqLength(sub(c, b));
            var casl = sqLength(sub(a, c));
            if (casl > absl && casl > bcsl) {
                tmp = a; a = c; c = b; b = tmp;
                tmp = absl; absl = casl; casl = bcsl; bcsl = tmp;
            } else if (bcsl > absl) {
                tmp = a; a = b; b = c; c = tmp;
                tmp = absl; absl = bcsl; bcsl = casl; casl = tmp;
            }
            var abn = mul(inversesqrt(absl), sub(b, a));
            var matrix = [
                abn.x, -abn.y,
                abn.y, abn.x
            ];

            function addVertex(coord, borderVector) {
                var ta = lTransform(matrix, sub(a, coord));
                var tb = lTransform(matrix, sub(b, coord));
                var tc = lTransform(matrix, sub(c, coord));
                var tbv = lTransform(matrix, new Vector(-borderVector.x, -borderVector.y));
                vertexData.push(
                    coord.x, coord.y,
                    borderVector.x, borderVector.y,
                    ta.x, tc.x, tb.x, ta.y, tc.y,
                    tbv.x, tbv.y
                );
                return vertexCount++;
            }

            if (absl < sqr(aspectThreshold*cross(abn, sub(c, a)))) {
                var bcn = mul(inversesqrt(bcsl), sub(c, b));
                var can = mul(inversesqrt(casl), sub(a, c));
                indices.push(addVertex(a, mul(Math.SQRT2*inversesqrt(dot(abn, can)+1), normalize(sub(can, abn)))));
                indices.push(addVertex(b, mul(Math.SQRT2*inversesqrt(dot(bcn, abn)+1), normalize(sub(abn, bcn)))));
                indices.push(addVertex(c, mul(Math.SQRT2*inversesqrt(dot(can, bcn)+1), normalize(sub(bcn, can)))));
            } else {
                var sa = lTransform(matrix, a);
                var sb = lTransform(matrix, b);
                var sc = lTransform(matrix, c);
                var qa = rTransform(new Vector(sa.x, sc.y), matrix);
                var qb = rTransform(new Vector(sb.x, sc.y), matrix);
                var i0 = addVertex(a, rTransform(new Vector(-1.0, -1.0), matrix));
                var i1 = addVertex(b, rTransform(new Vector(+1.0, -1.0), matrix));
                var i2 = addVertex(qa, rTransform(new Vector(-1.0, +1.0), matrix));
                var i3 = addVertex(qb, rTransform(new Vector(+1.0, +1.0), matrix));
                indices.push(i0, i1, i2, i3, i2, i1);
            }
        }

        var vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        var ibo = gl.createBuffer();
        var indexType, indexArray;
        if (vertexCount >= 65536) {
            if (!gl.getExtension('OES_element_index_uint'))
                return null;
            indexType = gl.UNSIGNED_INT;
            indexArray = new Uint32Array(indices);
        } else if (vertexCount >= 256) {
            indexType = gl.UNSIGNED_SHORT;
            indexArray = new Uint16Array(indices);
        } else {
            indexType = gl.UNSIGNED_BYTE;
            indexArray = new Uint8Array(indices);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        return {
            vbo: vbo,
            ibo: ibo,
            indexType: indexType,
            length: indices.length
        };
    }

    /**
     * Deletes a triangle mesh when it's no longer needed.
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {Object} triangleMesh The triangle mesh created by createTriangleMesh
     */
    PolyShadow.deleteTriangleMesh = function(gl, triangleMesh) {
        gl.deleteBuffer(triangleMesh.vbo);
        gl.deleteBuffer(triangleMesh.ibo);
    }

    /**
     * Draws a triangle mesh shadow (solid-color blurred triangles).
     * The shadows of the individual triangles must be combined additively, so a form of additive blending is required.
     * Depth test should be disabled to prevent clipping.
     * GL state changes: gl.useProgram, gl.ARRAY_BUFFER, gl.ELEMENT_ARRAY_BUFFER, gl.enableVertexAttribArray, gl.vertexAttribPointer
     * @param {WebGLRenderingContext} gl The WebGL context
     * @param {Object} triangleShader The triangle shader created by createTriangleShader
     * @param {Object} triangleMesh The triangle mesh created by createTriangleMesh
     * @param {number[]} transformation A 4x4 vertex transformation matrix in the form of an array of 16 floats
     * @param {number} sigma The blur intensity (the sigma coefficient of the Gaussian distribution)
     * @param {number[]} fillColor The foreground color as an array of [r, g, b, a] - values between 0 and 1
     * @param {number[]} bgColor The background color (to be used in the outer portion of filled fragments) as an array of [r, g, b, a] - values between 0 and 1
     * @param {number} cutoff Even though the Gaussian distribution extends to infinity, it will be cut off when opacity is below this threshold
     */
    PolyShadow.drawTriangleMesh = function(gl, triangleShader, triangleMesh, transformation, sigma, fillColor = [0.0, 0.0, 0.0, 1.0], bgColor = [0.0, 0.0, 0.0, 0.0], cutoff = 1.0/512.0) {
        gl.useProgram(triangleShader.program);
        gl.uniformMatrix4fv(triangleShader.uTransformation, false, transformation);
        gl.uniform1f(triangleShader.uInvSigma, 1.0/sigma);
        gl.uniform1f(triangleShader.uBorder, computeBorder(sigma, cutoff));
        gl.uniform4fv(triangleShader.uBaseColor, bgColor);
        gl.uniform4f(triangleShader.uColorVector, fillColor[0]-bgColor[0], fillColor[1]-bgColor[1], fillColor[2]-bgColor[2], fillColor[3]-bgColor[3]);
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleMesh.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleMesh.ibo);
        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
        gl.enableVertexAttribArray(2);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 44, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 16);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 44, 28);
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
        gl.drawElements(gl.TRIANGLES, triangleMesh.length, triangleMesh.indexType, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.useProgram(null);
    }

}(window.PolyShadow = window.PolyShadow || { }));
