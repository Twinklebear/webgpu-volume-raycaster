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
    view_proj: mat4x4<f32>;
};

[[group(0), binding(0)]]
var<uniform> view_params: ViewParams;

[[stage(vertex)]]
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = view_params.view_proj * vec4<f32>(vert.position, 1.0);
    return out;
};

[[stage(fragment)]]
fn fragment_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {
    return vec4<f32>(1.0);
}
`;
