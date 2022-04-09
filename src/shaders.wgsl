// Reduce clutter/keyboard pain
type float2 = vec2<f32>;
type float3 = vec3<f32>;
type float4 = vec4<f32>;
type uint2 = vec4<u32>;

// TODO: Would need to write a custom webpack loader for wgsl that
// processes #include to be able to #include this
struct LCGRand {
     state: u32;
};

fn murmur_hash3_mix(hash_in: u32, k_in: u32) -> u32
{
    let c1 = 0xcc9e2d51u;
    let c2 = 0x1b873593u;
    let r1 = 15u;
    let r2 = 13u;
    let m = 5u;
    let n = 0xe6546b64u;

    var k = k_in * c1;
    k = (k << r1) | (k >> (32u - r1));
    k *= c2;

    var hash = hash_in ^ k;
    hash = ((hash << r2) | (hash >> (32u - r2))) * m + n;

    return hash;
}

fn murmur_hash3_finalize(hash_in: u32) -> u32
{
    var hash = hash_in ^ (hash_in >> 16u);
    hash *= 0x85ebca6bu;
    hash ^= hash >> 13u;
    hash *= 0xc2b2ae35u;
    hash ^= hash >> 16u;

    return hash;
}

fn lcg_random(rng: ptr<function, LCGRand>) -> u32
{
    let m = 1664525u;
    let n = 1013904223u;
    // WGSL please Add an arrow operator or only use refs/inout
    // This is really a pain
    (*rng).state = (*rng).state * m + n;
    return (*rng).state;
}

fn lcg_randomf(rng: ptr<function, LCGRand>) -> f32
{
	return ldexp(f32(lcg_random(rng)), -32);
}

fn get_rng(frame_id: u32, pixel: uint2, dims: uint2) -> LCGRand
{
    var rng: LCGRand;
    rng.state = murmur_hash3_mix(0u, pixel.x + pixel.y * dims.x);
    rng.state = murmur_hash3_mix(rng.state, frame_id);
    rng.state = murmur_hash3_finalize(rng.state);
    return rng;
}

struct VertexInput {
    @location(0) position: float3;
};

struct VertexOutput {
    @builtin(position) position: float4;
    @location(0) transformed_eye: float3;
    @location(1) ray_dir: float3;
};

struct ViewParams {
    proj_view: mat4x4<f32>;
    // Not sure on WGSL padding/alignment rules for blocks,
    // just assume align/pad to vec4
    eye_pos: float4;
    //volume_scale: float4;
};

@group(0) @binding(0)
var<uniform> view_params: ViewParams;

@group(0) @binding(1)
var volume: texture_3d<f32>;

@group(0) @binding(2)
var colormap: texture_2d<f32>;

@group(0) @binding(3)
var tex_sampler: sampler;

@stage(vertex)
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    var pos = vert.position;
    out.position = view_params.proj_view * float4(pos, 1.0);
    out.transformed_eye = view_params.eye_pos.xyz;
    out.ray_dir = pos - out.transformed_eye;
    return out;
};

fn intersect_box(orig: float3, dir: float3) -> float2 {
	var box_min = float3(0.0);
	var box_max = float3(1.0);
	var inv_dir = 1.0 / dir;
	var tmin_tmp = (box_min - orig) * inv_dir;
	var tmax_tmp = (box_max - orig) * inv_dir;
	var tmin = min(tmin_tmp, tmax_tmp);
	var tmax = max(tmin_tmp, tmax_tmp);
	var t0 = max(tmin.x, max(tmin.y, tmin.z));
	var t1 = min(tmax.x, min(tmax.y, tmax.z));
	return float2(t0, t1);
}

fn linear_to_srgb(x: f32) -> f32 {
	if (x <= 0.0031308) {
		return 12.92 * x;
	}
	return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

@stage(fragment)
fn fragment_main(in: VertexOutput) -> @location(0) float4 {
    var ray_dir = normalize(in.ray_dir);

	var t_hit = intersect_box(in.transformed_eye, ray_dir);
	if (t_hit.x > t_hit.y) {
		discard;
	}
	t_hit.x = max(t_hit.x, 0.0);

    var color = float4(0.0);
	var dt_vec = 1.0 / (float3(256.0) * abs(ray_dir));
    var dt_scale = 1.0;
	var dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
	var p = in.transformed_eye + t_hit.x * ray_dir;
	for (var t = t_hit.x; t < t_hit.y; t = t + dt) {
		var val = textureSampleLevel(volume, tex_sampler, p, 0.0).r;
		var val_color = float4(textureSampleLevel(colormap, tex_sampler, float2(val, 0.5), 0.0).rgb, val);
		// Opacity correction
		val_color.a = 1.0 - pow(1.0 - val_color.a, dt_scale);
        // WGSL can't do left hand size swizzling!?!?
        // https://github.com/gpuweb/gpuweb/issues/737 
        // That's ridiculous for a shader language.
        var tmp = color.rgb + (1.0 - color.a) * val_color.a * val_color.xyz; 
		color.r = tmp.r;
		color.g = tmp.g;
		color.b = tmp.b;
		color.a = color.a + (1.0 - color.a) * val_color.a;
		if (color.a >= 0.95) {
			break;
		}
		p = p + ray_dir * dt;
	}

    color.r = linear_to_srgb(color.r);
    color.g = linear_to_srgb(color.g);
    color.b = linear_to_srgb(color.b);
    return color;
}

