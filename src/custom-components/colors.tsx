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
export const colorForValue = (value: number): ColorRangeKey => {
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

const colorRangePositions: Record<string, number> = {
    '5. VERY HIGH COST': 1,
    '4. HIGH COST': 0.75,
    '3. MEDIUM COST': 0.5,
    '2. LOW COST': 0.25,
    '1. VERY LOW COST': 0,
};

export const colorRangeKeys: Record<string, string[]> = Object.fromEntries(
    Object.entries(colorRangePositions).map(([category, position]) => [
        category,
        Object.keys(colorScaleList)
            .map((scaleKey) => colorScaleList[scaleKey].find(([pos]) => pos === position)?.[1])
            .filter((color): color is string => Boolean(color)),
    ])
);

export const getColorRangeKeyByValue = (colorValue: string): string | undefined => {
    return Object.keys(colorRangeKeys).find((rangeKey) => colorRangeKeys[rangeKey].includes(colorValue));
};

export const setHighlighterStyles = (components:OBC.Components, colorscale:string='gnylrd', lod:number, viewer:string='cost') => {
    const highlighter = components.get(OBCF.Highlighter)
    
    if (viewer=='cost'){
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
    } else {
        switch (lod) {
            case 0:
                highlighter.styles.set('LOD_0_color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_0_color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_0_color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_0_color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_0_color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})            
                break;
            case 1:
                highlighter.styles.set('LOD_1_color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_1_color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_1_color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_1_color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_1_color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                break;
            case 2:
                highlighter.styles.set('LOD_2_color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_2_color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_2_color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_2_color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_2_color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                break;
            case 21:
                highlighter.styles.set('LOD_21_color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_21_color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_21_color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_21_color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                highlighter.styles.set('LOD_21_color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 1})
                break;
        }
    }
}



// exported main functions
/**
 * Normalizes input values in a map and maps them to colors based on a colorscale.
 * Performs a two-step normalization: global normalization and then filtered range normalization.
 *
 * @param map - Record of keys and numerical values
 * @param colorscale - Name of the color scale to use (default: 'gnylrd')
 * @param rangeMin - Minimum normalized value to include
 * @param rangeMax - Maximum normalized value to include
 * @param InInterval - Defines whether the filter applies to values inside or outside the selected range (rangeMin, rangeMax)
 * @param NormalOrCost - Specifies whether the range refers to normalized values (0–1) or to actual cost values before normalization
 * @returns Tuple: [mapping of keys to color strings, mapping of keys to normalized values]
 */
export function normalizeAndMapToColor (map: Record<string, number>, colorscale: string = 'gnylrd', rangeMin: number, rangeMax: number, InInterval: string = 'Inside', NormalOrCost: string = 'Percentile'): [Record<string, string>, Record<string, number>] {
    const colorScale = colorScaleList[colorscale];

    // Normalizzazione dei valori
    const values = Object.values(map);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const result: Record<string, string> = {};
    const temporaryResultNormalized: Record<string, number> = {};
    const resultNormalized: Record<string, number> = {};
    let filteredEntries: [string, number][] = []
    
    // Here will be done all the filtering of costs according to:
    //      - rangeMin and rangeMax values
    //      - values inside or outside the selected range (rangeMin, rangeMax)
    //      - rangeMin and rangeMax refers to normalized values (0–1) or to actual cost values before normalization
    if (['Percentile','Normal'].includes(NormalOrCost)){ // if the range uses normalized values
        for (const [key, value] of Object.entries(map)) {
            temporaryResultNormalized[key] = (value - min) / range; // Normalization of all values
        }
        // Filter elements according to normalized choosen range
        filteredEntries = Object.entries(temporaryResultNormalized).filter(([, normalized]) => {
            return InInterval == 'Inside' ? (normalized >= rangeMin && normalized <= rangeMax) : (normalized < rangeMin || normalized > rangeMax) // if the range is inside or outside
        })
    } else { // if the range refers to the cost value
        for (const [key, value] of Object.entries(map)) { // here the filter has to be done in the initial map before normalization
            if (InInterval=='Inside'){ // if the range is inside min and max values
                if (value<rangeMin || value>rangeMax) continue // exclude this cost item if it is outside the range
            } else { // if the range is outside
                if (value>=rangeMin && value<=rangeMax) continue // exclude if the cost item is inside
            }
            temporaryResultNormalized[key] = (value - min) / range // normalize the cost value if it passed the previous checks
        }
        filteredEntries = Object.entries(temporaryResultNormalized) // extract values in the final structure
    }

    // if no cost items respect the filters, return the function
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
export function groupIdsByNormalizedValuePerModel(components:OBC.Components, normalizedData: Record<string, number>, perModelData: PerModelInput, colorscale:string='gnylrd'): PerModelGrouped { //for cost
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
            const value = normalizedData[id]
            if (value !== undefined) {
                const color = colorForValue(value)
                if (color) {
                    grouped[color].push(id)
                }
            }
        }
        result[modelName] = grouped;
    }
    setHighlighterStyles(components,colorscale,0,'cost')
    return result;
}

/**
 * From localId_normValue map, map to colors and highlight items
 *
 * @param components - ThatOpen Components instance
 * @param map - Map localId_normValue
 * @param colorscale - Name of the color scale to use (default: 'gnylrd')
 * @param model - The name of the model to highlight items
 * @returns Nothing
 */
export function urbanMapToColor (components:OBC.Components, map:{[key:string]:number}, colorscale: string = 'gnylrd', model:string='', lod:number=0) {
    const result: {[key:string]:string[]} = {};
    const highlighter = components.get(OBCF.Highlighter)

    for (const [localId, normValue] of Object.entries(map)) {
        // Determina il colore in base al valore normalizzato finale
        const colorRange = colorForValue(normValue);
        result[colorRange] ? result[colorRange].push(localId) : result[colorRange]=[localId]
    }
    setHighlighterStyles(components,colorscale,lod,'urban')

    for (const [color,ids] of Object.entries(result)) {
        const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>(ids.map(str => Number(str)).filter(n => !isNaN(n))) } //create the model id map
        const highlighterName = `LOD_${lod}_${color}`
        highlighter.highlightByID(highlighterName,modelIdMap,false,false) //color elements using highlighter
    }

    return result
}
