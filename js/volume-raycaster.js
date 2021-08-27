(async () => {
    if (!navigator.gpu) {
        document.getElementById('webgpu-canvas').setAttribute('style', 'display:none;');
        document.getElementById('no-webgpu').setAttribute('style', 'display:block;');
        return;
    }

    // Get a GPU device to render with
    var adapter = await navigator.gpu.requestAdapter();
    var device = await adapter.requestDevice();

    // Get a context to display our rendered image on the canvas
    var canvas = document.getElementById('webgpu-canvas');
    var context = canvas.getContext('webgpu');

    // Setup shader modules
    var shaderModule = device.createShaderModule({code: shaderCode});
    var compilationInfo = await shaderModule.compilationInfo();
    if (compilationInfo.messages.length > 0) {
        var hadError = false;
        console.log("Shader compilation log:");
        for (var msg in compilationInfo.messages) {
            console.log(`${msg.lineNum}:${msg.linePos} - ${msg.message}`);
            hadError = hadError || msg.type == "error";
        }
        if (hadError) {
            console.log("Shader failed to compile");
            return;
        }
    }

    const cube = getCubeMesh();

    // Upload cube to use to trigger raycasting of the volume
    var vertexBuffer = device.createBuffer({
        size: cube.vertices.length * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(cube.vertices);
    vertexBuffer.unmap();

    var indexBuffer = device.createBuffer(
        {size: cube.indices.length * 4, usage: GPUBufferUsage.INDEX, mappedAtCreation: true});
    new Uint16Array(indexBuffer.getMappedRange()).set(cube.indices);
    indexBuffer.unmap();

    // Create a buffer to store the view parameters
    var viewParamsBuffer = device.createBuffer(
        {size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});

    // Setup render outputs
    var swapChainFormat = 'bgra8unorm';
    context.configure(
        {device: device, format: swapChainFormat, usage: GPUTextureUsage.OUTPUT_ATTACHMENT});

    var depthFormat = 'depth24plus-stencil8';
    var depthTexture = device.createTexture({
        size: {width: canvas.width, height: canvas.height, depth: 1},
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    var bindGroupLayout = device.createBindGroupLayout({
        entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}]
    });

    var viewParamBG = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{binding: 0, resource: {buffer: viewParamsBuffer}}]

    });

    // Create render pipeline
    var layout = device.createPipelineLayout({bindGroupLayouts: [bindGroupLayout]});

    var vertexState = {
        module: shaderModule,
        entryPoint: "vertex_main",
        buffers: [{
            arrayStride: 3 * 4,
            attributes: [{format: 'float32x3', offset: 0, shaderLocation: 0}]
        }]
    };

    var fragmentState = {
        module: shaderModule,
        entryPoint: "fragment_main",
        targets: [{format: swapChainFormat}]
    };

    var renderPipeline = device.createRenderPipeline({
        layout: layout,
        vertex: vertexState,
        fragment: fragmentState,
        primitive: {
            topology: "triangle-strip",
            stripIndexFormat: "uint16",
        },
        depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: 'less'}
    });

    var renderPassDesc = {
        colorAttachments: [{attachment: undefined, loadValue: [0.3, 0.3, 0.3, 1]}],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthLoadValue: 1.0,
            depthStoreOp: 'store',
            stencilLoadValue: 0,
            stencilStoreOp: 'store'
        }
    };

    var camera = new ArcballCamera(defaultEye, center, up, 2, [canvas.width, canvas.height]);
    var proj = mat4.perspective(
        mat4.create(), 50 * Math.PI / 180.0, canvas.width / canvas.height, 0.1, 100);
    var projView = mat4.create();

    // Register mouse and touch listeners
    var controller = new Controller();
    controller.mousemove = function(prev, cur, evt) {
        if (evt.buttons == 1) {
            camera.rotate(prev, cur);

        } else if (evt.buttons == 2) {
            camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
        }
    };
    controller.wheel = function(amt) {
        camera.zoom(amt);
    };
    controller.pinch = controller.wheel;
    controller.twoFingerDrag = function(drag) {
        camera.pan(drag);
    };
    controller.registerForCanvas(canvas);

    var frame = function() {
        if (!document.hidden) {
            // Update camera buffer
            projView = mat4.mul(projView, proj, camera.camera);

            var upload = device.createBuffer(
                {size: 16 * 4, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true});
            new Float32Array(upload.getMappedRange()).set(projView);
            upload.unmap();

            var commandEncoder = device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(upload, 0, viewParamsBuffer, 0, 16 * 4);

            renderPassDesc.colorAttachments[0].view = context.getCurrentTexture().createView();
            var renderPass = commandEncoder.beginRenderPass(renderPassDesc);

            renderPass.setPipeline(renderPipeline);
            renderPass.setBindGroup(0, viewParamBG);
            renderPass.setVertexBuffer(0, vertexBuffer);
            renderPass.setIndexBuffer(indexBuffer, "uint16");
            renderPass.draw(cube.vertices.length / 3, 1, 0, 0);

            renderPass.endPass();
            device.queue.submit([commandEncoder.finish()]);
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
})();
