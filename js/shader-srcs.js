const shaderCode =
    `
struct VertexInput {
    [[location(0)]] position: vec3<f32>;
};

struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
};

[[block]]
struct ViewParams {
    proj_view: mat4x4<f32>;
    // Not sure on WGSL padding/alignment rules for blocks,
    // just assume align/pad to vec4
    //eye_pos: vec4<f32>;
    //volume_scale: vec4<f32>;
};

[[group(0), binding(0)]]
var<uniform> view_params: ViewParams;

[[group(0), binding(1)]]
var volume: texture_3d<f32>;

[[group(0), binding(2)]]
var colormap: texture_2d<f32>;

[[group(0), binding(3)]]
var tex_sampler: sampler;

[[stage(vertex)]]
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = view_params.proj_view * vec4<f32>(vert.position, 1.0);
    return out;
};

[[stage(fragment)]]
fn fragment_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {
    var color = textureSample(colormap, tex_sampler, vec2<f32>(1.0)).xyz;
    return vec4<f32>(color, 1.0);
}
`;
