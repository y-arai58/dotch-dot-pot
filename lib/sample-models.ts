import legacySamples from './samples.json';
import animationSamples from './animation-samples.json';
import animalSamples from './animal-samples.json';
import type {Model} from './pixel';
import type {RiggedModel} from './animation';
import type {AnimalModel} from './animal-animation';

const legacy = legacySamples as Model[];
const humanoids = animationSamples as RiggedModel[];
const animals = animalSamples as AnimalModel[];
const replacements = new Map(humanoids.map(model => [model.id, {
 ...model, id: `${model.id}-articulated-v1`,
}]));

/** New assets share the same articulated geometry in the pixel and motion editors. */
export const SAMPLE_MODELS:Model[] = [
 ...legacy.map(model => replacements.get(model.id) || model),
 ...animals,
];

const staticModels = new Map([...legacy, ...SAMPLE_MODELS].map(model => [model.id, model]));
const motionModels = new Map([...humanoids, ...replacements.values()].map(model => [model.id, model]));

/** Old IDs must retain their original geometry so saved pixels and edits remain valid. */
export function sampleModel(id:string):Model|undefined { return staticModels.get(id); }

/** Legacy animation documents already used articulated geometry; preserve that lookup. */
export function humanoidSample(id:string):RiggedModel|undefined { return motionModels.get(id); }

/** Conversion is explicit; a legacy surface edit cannot be copied onto new topology. */
export function articulatedReplacement(id:string):RiggedModel|undefined { return replacements.get(id); }
