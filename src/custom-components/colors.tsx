import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as OBC from '@thatopen/components'

// custom types
/**
 * Key type for discrete color ranges used in normalization.
 */
type ColorRangeKey = "color_0_02" | "color_02_04" | "color_04_06" | "color_06_08" | "color_08_1";

/**
 * Data grouped by color range.
 * Each key corresponds to a ColorRangeKey and stores an array of element IDs.
 */
type GroupedData = Record<ColorRangeKey, string[]>;

/**
 * Input data per model.
 * Outer key is the model name, inner key is element ID, value can be any metadata.
 */
type PerModelInput = Record<string, Record<string, any>>;

/**
 * Grouped data per model.
 * Outer key is the model name, value is GroupedData (elements grouped by color range).
 */
type PerModelGrouped = Record<string, GroupedData>;



// Custom function needed only here
/**
 * Assigns a discrete color range key based on a normalized value between 0 and 1.
 *
 * @param value - Normalized number between 0 and 1
 * @returns The corresponding color range key
 */
const colorForValue = (value: number): ColorRangeKey => {
    if (value >= 0 && value < 0.20) return "color_0_02";
    if (value >= 0.20 && value < 0.40) return "color_02_04";
    if (value >= 0.40 && value < 0.60) return "color_04_06";
    if (value >= 0.60 && value < 0.80) return "color_06_08";
    if (value >= 0.80 && value <= 1.00) return "color_08_1";
    return "color_08_1"
}

/**
 * Predefined color scales used for mapping normalized values to colors.
 * Each colorscale contains an array of tuples: [normalized position (0-1), RGBA color string].
 */
const colorScaleList: { [key: string]: [number, string][] } = {
    gnylrd: [
        [0,'rgba(26, 150, 65, 1)'],
        [1/4,'rgba(166, 217, 106, 1)'],
        [2/4,'rgba(255, 255, 0, 1)'],
        [3/4,'rgba(253, 174, 97, 1)'],
        [1,'rgba(215, 25, 28, 1)']
    ],
    viridis: [
        [0,'rgba(68, 1, 84, 1)'],
        [1/4,'rgba(59, 82, 139, 1)'],
        [2/4,'rgba(33, 144, 141, 1)'],
        [3/4,'rgba(94, 201, 98, 1)'],
        [1,'rgba(253, 231, 37, 1)']
    ],
    ylgnbu: [
        [0, 'rgba(255, 255, 204, 1)'],
        [1/4, 'rgba(194, 230, 153, 1)'],
        [2/4, 'rgba(120, 198, 121, 1)'],
        [3/4, 'rgba(49, 163, 84, 1)'],
        [1, 'rgba(0, 104, 55, 1)']
    ],
    blues: [
        [0, 'rgba(239, 243, 255, 1)'],
        [1/4, 'rgba(189, 215, 231, 1)'],
        [2/4, 'rgba(107, 174, 214, 1)'],
        [3/4, 'rgba(33, 113, 181, 1)'],
        [1, 'rgba(8, 69, 148, 1)']
    ],
    orrd: [
        [0, 'rgba(254, 240, 217, 1)'],
        [1/4, 'rgba(253, 212, 158, 1)'],
        [2/4, 'rgba(253, 187, 132, 1)'],
        [3/4, 'rgba(253, 141, 60, 1)'],
        [1, 'rgba(217, 72, 1, 1)']
    ],
    cividis: [
        [0, 'rgba(0, 32, 76, 1)'],
        [1/4, 'rgba(55, 64, 129, 1)'],
        [2/4, 'rgba(94, 109, 171, 1)'],
        [3/4, 'rgba(145, 158, 203, 1)'],
        [1, 'rgba(253, 231, 37, 1)']
    ],
};



// exported main functions
/**
 * Normalizes input values in a map and maps them to colors based on a colorscale.
 * Performs a two-step normalization: global normalization and then filtered range normalization.
 *
 * @param map - Record of keys and numerical values
 * @param colorscale - Name of the color scale to use (default: 'gnylrd')
 * @param rangeMin - Minimum normalized value to include
 * @param rangeMax - Maximum normalized value to include
 * @returns Tuple: [mapping of keys to color strings, mapping of keys to normalized values]
 */
export function normalizeAndMapToColor (map: Record<string, number>, colorscale: string = 'gnylrd', rangeMin: number, rangeMax: number): [Record<string, string>, Record<string, number>] {
    const colorScale = colorScaleList[colorscale];

    // Normalizzazione dei valori
    const values = Object.values(map);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const result: Record<string, string> = {};
    const temporaryResultNormalized: Record<string, number> = {};
    const resultNormalized: Record<string, number> = {};

    for (const [key, value] of Object.entries(map)) {
        // Normalizzazione globale iniziale
        temporaryResultNormalized[key] = (value - min) / range;
    }

    // Filtra solo i valori normalizzati nel range specificato
    const filteredEntries = Object.entries(temporaryResultNormalized).filter(
        ([, normalized]) => normalized >= rangeMin && normalized <= rangeMax
    );

    if (filteredEntries.length === 0) return [{}, {}];

    // Trova il minimo e massimo dei valori filtrati (per la seconda normalizzazione)
    const filteredValues = filteredEntries.map(([, normalized]) => normalized);
    const fMin = Math.min(...filteredValues);
    const fMax = Math.max(...filteredValues);
    const fRange = fMax - fMin || 1;

    for (const [key, normalized] of filteredEntries) {
        // Seconda normalizzazione tra 0 e 1 sui valori filtrati
        const renormalized = (normalized - fMin) / fRange;
        resultNormalized[key] = renormalized;

        // Determina il colore in base al valore normalizzato finale
        const colorRange = colorForValue(renormalized);
        switch (colorRange) {
            case "color_0_02":
                result[key] = colorScale.find(([v]) => v === 0)?.[1] as string;
                break;
            case "color_02_04":
                result[key] = colorScale.find(([v]) => v === 0.25)?.[1] as string;
                break;
            case "color_04_06":
                result[key] = colorScale.find(([v]) => v === 0.5)?.[1] as string;
                break;
            case "color_06_08":
                result[key] = colorScale.find(([v]) => v === 0.75)?.[1] as string;
                break;
            case "color_08_1":
                result[key] = colorScale.find(([v]) => v === 1)?.[1] as string;
                break;
        }
    }
    return [result, resultNormalized];
};

/**
 * Groups element IDs per model into color ranges based on normalized values.
 * Also assigns corresponding Three.js color styles to the highlighter component.
 *
 * @param components - ThatOpen Components instance
 * @param normalizedData - Record of element IDs to normalized values (0-1)
 * @param perModelData - Record of model names to element data
 * @param colorscale - Name of the color scale to use (default: 'gnylrd')
 * @returns Grouped data per model, with color ranges and lists of IDs
 */
export function groupIdsByNormalizedValuePerModel(components:OBC.Components, normalizedData: Record<string, number>, perModelData: PerModelInput, colorscale:string='gnylrd'): PerModelGrouped {
    const highlighter = components.get(OBCF.Highlighter)
    const result: PerModelGrouped = {}
    for (const [modelName, elements] of Object.entries(perModelData)) {
        const grouped: GroupedData = {
            color_0_02: [],
            color_02_04: [],
            color_04_06: [],
            color_06_08: [],
            color_08_1: []
        }
        for (const id of Object.keys(elements)) {
        const value = normalizedData[id];
            if (value !== undefined) {
                const color = colorForValue(value);
                if (color) {
                    grouped[color].push(id);
                }
            }
        }
        result[modelName] = grouped;
    }
    
    highlighter.styles.set('color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})

    highlighter.styles.set('color_0_02_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_02_04_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_04_06_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_06_08_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
    highlighter.styles.set('color_08_1_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})

    return result;
}