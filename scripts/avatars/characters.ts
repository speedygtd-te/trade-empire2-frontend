/**
 * Character definitions for avatar generation.
 *
 * Each character has a base prompt for initial avatar generation
 * and a framePrefix used when generating context-specific frames.
 */

export interface Character {
  id: string;
  name: string;
  role: string;
  basePrompt: string;
  framePrefix: string;
}

export const CHARACTERS: Character[] = [
  {
    id: 'dr_vasquez',
    name: 'Dr. Elena Vasquez',
    role: 'Research Director',
    basePrompt: `Photorealistic half-body portrait of a young woman in her late 20s, striking white platinum hair in a neat professional style, very pale white skin, piercing light ice-blue eyes, wearing a sleek futuristic lab coat with subtle holographic insignia, standing in a high-tech sci-fi research laboratory with glowing screens and equipment in the background. The Expanse aesthetic, dark cinematic lighting, shallow depth of field with slightly blurred background bokeh. Dramatic rim lighting from lab equipment. Serious, intelligent expression. Ultra detailed skin texture, 8k quality, photorealistic.`,
    framePrefix: 'Dr. Elena Vasquez, young woman with white platinum hair, pale skin, ice-blue eyes, futuristic lab coat,',
  },
  {
    id: 'captain_bredvik',
    name: 'Captain J\u00f8rn Bredvik',
    role: 'Fleet Captain',
    basePrompt: `Photorealistic half-body portrait of an older man in his late 50s, thick well-groomed full beard with grey streaks, weathered rugged face with deep lines telling stories of a hard life, wearing a dark naval-style spaceship captain uniform with rank insignia, standing on a dimly lit spaceship bridge with holographic tactical displays in the background. The Expanse aesthetic, dark cinematic lighting, shallow depth of field with blurred bridge equipment bokeh. Dramatic side lighting. Commanding but weary expression. Ultra detailed skin texture, 8k quality, photorealistic.`,
    framePrefix: 'Captain J\u00f8rn Bredvik, older man with full grey-streaked beard, weathered face, dark captain uniform,',
  },
  {
    id: 'director_ashford',
    name: 'Director Marcus Ashford',
    role: 'Colony Administrator',
    basePrompt: `RAW photograph, unretouched DSLR photo, half-body portrait of a distinguished middle-aged man in his late 40s, strong weathered jawline with visible age lines and deep nasolabial folds, prominent crow's feet around dark piercing calculating eyes, greying silver temples blending into swept-back dark hair with a precise side part and a few natural flyaway strands, clean-shaven but with clearly visible 5 o'clock shadow stubble texture across jaw and upper lip, natural imperfect skin with visible pores on nose and cheeks, slight redness and broken capillaries around nose, minor skin blemishes and uneven skin tone, subtle age spots near temples, noticeable dark circles and slight puffiness under eyes, visible thin veins on temples, slightly asymmetric face with one eyebrow sitting marginally higher than the other, broad imposing shoulders, wearing an expensive dark futuristic business suit with mandarin collar and subtle tech-fabric sheen, sitting in a spacious executive office with a large viewport showing stars and a distant planet colony in the background. The Expanse aesthetic, dark cinematic mood lighting with warm practical lights from desk lamp mixing with cool viewport light, shallow depth of field with creamy bokeh background. Shot on Canon EOS R5 with 85mm f/1.4 lens, natural practical lighting, visible subsurface skin scattering, real skin micro-texture, photojournalistic documentary quality. Confident calculating intimidating expression of a powerful man who controls entire colonies. Ultra realistic skin texture with all natural imperfections, NO retouching, NO airbrushing, NO skin smoothing, NO AI look, NOT perfect skin, NOT digitally enhanced, raw unedited photograph quality.`,
    framePrefix: 'Director Marcus Ashford, distinguished middle-aged man with greying temples, strong jawline, age lines, clean-shaven, broad shoulders, dark futuristic business suit with mandarin collar,',
  },
];
