import type { Table } from "apache-arrow"
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import { colorForValue } from "./colors"
import { addOverlay } from "./addOverlay"

/**
 * Converts currency code from IFC values to a user-friendly symbol.
 * Supported: EUR → €, USD → $
 *
 * @param currency - The IFC currency code
 * @returns The currency symbol
 */
export function convertCurrency (currency:string): string{
    if (currency == 'EUR'){
        currency = '€'
    } else if (currency == 'USD'){
        currency = '$'
    }
    return currency
}


/**
 * Converts unit of measure from IFC predefined values to a user-friendly string.
 * Supported: METRE → m, SQUARE_METRE → m², CUBIC_METRE → m³, "" → nd
 *
 * @param unitMeasure - The IFC unit measure string
 * @returns The converted unit string
 */
export function convertUnits (unitMeasure:string): string {
    //this is only to convert predefined IFC unit measures, but if there are personalized such as kg, ton, cad will be automatically used as they are
    if (unitMeasure == 'METRE'){
        unitMeasure = 'm'
    } else if (unitMeasure == 'SQUARE_METRE'){
        unitMeasure = 'm²'
    } else if (unitMeasure == 'CUBIC_METRE'){
        unitMeasure = 'm³'
    } else if (unitMeasure == '') {
        unitMeasure = 'nd'
    }
    return unitMeasure
}

/**
 * Searches within an Arrow Table for the first row where a specified column
 * matches a given filter value, and returns the corresponding value from
 * another target column.
 *
 * @param arrowFile The Arrow Table to query.
 * @param columnToGetValue Name of the column from which the value should be returned.
 * @param ColumnForFilter Name of the column used to apply the filtering condition.
 * @param valueForFilter Value to match in the filter column in order to select the row.
 * @returns The value found in the target column for the matching row, or
 *          undefined if no match is found or if the provided columns do not exist.
 */
export function getArrowLineValue (arrowFile:Table<any>, columnToGetValue:string, ColumnForFilter:string, valueForFilter:string|number): typeof result {
    const col = arrowFile.getChild(columnToGetValue)
    const colFilter = arrowFile.getChild(ColumnForFilter)
    if (!col || !colFilter) return
    let result: number|string|undefined = undefined
    if (typeof valueForFilter == "string") {
        for (let i = 0; i < colFilter.length; i++) {
            if (colFilter.get(i) == valueForFilter) {
                result = col.get(i); // otteniamo il valore corrispondente
                return result
            }
        }
    } else {
        for (let i = 0; i < colFilter.length; i++) {
            if (Number(colFilter.get(i)) == valueForFilter) {
                result = col.get(i); // otteniamo il valore corrispondente
                console.log(result)
                return result
            }
        }
    }
}

// Parsing WKT POLYGON / MULTIPOLYGON → array di poligoni (solo contorni esterni)
/**
 * Parsing WKT POLYGON / MULTIPOLYGON → array di poligoni (solo contorni esterni)
 */
export function parseWKTPolygon(wkt: string): [number, number][][] {
    const polygons: [number, number][][] = [];

    const parseRing = (ringStr: string): [number, number][] => {
        return ringStr
            .split(",")
            .map(pt => {
                const nums = pt.trim().split(/\s+/).map(Number);
                if (nums.length !== 2 || nums.some(isNaN)) {
                    //console.warn(`Punto non valido scartato: ${pt}`);
                    return null;
                }
                return [nums[0], nums[1]] as [number, number];
            })
            .filter((p): p is [number, number] => p !== null);
    };

    if (wkt.startsWith("POLYGON")) {
        const inner = wkt.replace(/^POLYGON\s*\(\(/i, "").replace(/\)\)\s*$/, "");
        const coords = inner.split("),(");
        if (coords.length > 0) {
            const outerRing = parseRing(coords[0]);
            if (outerRing.length > 0) polygons.push(outerRing);
        }
    }

    if (wkt.startsWith("MULTIPOLYGON")) {
        const cleanedWKT = wkt.replace(/^MULTIPOLYGON\s*\(\(\(/i, "").replace(/\)\)\)\s*$/, "");
        const polyStrings = cleanedWKT.split(")), ((");
        polyStrings.forEach(polyStr => {
            const rings = polyStr.split("),(");
            if (rings.length > 0) {
                const outerRing = parseRing(rings[0]);
                if (outerRing.length > 0) polygons.push(outerRing);
            }
        });
    }

    return polygons;
}

export function formatNumber(n: number): string {
    if (Math.abs(n) < 0.001 && n !== 0) {
        // scientifico: 3 cifre significative dopo la virgola
        return n.toExponential(3);
    } else {
        // normale, con fino a 5 cifre decimali, ma senza zeri terminali
        let s = n.toFixed(5);
        // rimuove zeri finali
        s = s.replace(/(\.\d*?[1-9])0+$/g, '$1');
        // se tutto dopo la virgola sono zeri, rimuove anche il punto
        s = s.replace(/\.0+$/, '');
        return s;
    }
}

export function normalizeParamOne(data: Record<string, any>): Record<string, any> {
    const rawValues = Object.values(data).map(d => d.param_one);
    // prendi solo i valori finiti per calcolare min e max
    const finiteValues = rawValues.filter(v => Number.isFinite(v));
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    return Object.fromEntries(
        Object.entries(data).map(([key, obj]) => {
            const v = obj.param_one;
            let normalized
            if (v === Infinity) {
                normalized = 1;
            } else if (v === -Infinity) {
                normalized = 0;
            } else {
                normalized = (v - min) / (max - min);
            }
            return [
                key,
                {
                    ...obj,
                    param_one_normalized: normalized,
                },
            ];
        })
    );
}

type NestedStringObject = Record<string, Record<string | number, string>>;
export function normalizeParamTwoForColorsNormalization(input: NestedStringObject) {
    const output: Record<string, Record<string | number, number>> = {};
    // Estrai tutti i valori numerici validi (escludendo +/-Infinity)
    const allFiniteValues: number[] = [];
    for (const inner of Object.values(input)) {
        for (const raw of Object.values(inner)) {
            const num = Number(raw);
            if (Number.isFinite(num)) {
                allFiniteValues.push(num);
            }
        }
    }
    const min = Math.min(...allFiniteValues);
    const max = Math.max(...allFiniteValues);
    // Ricostruisci l'oggetto con normalizzazione
    for (const [key, innerObj] of Object.entries(input)) {
        const newInner: Record<string | number, number> = {};
        for (const [subKey, raw] of Object.entries(innerObj)) {
            const num = Number(raw);
            let normalized: number;
            if (num === Infinity) normalized = 1;
            else if (num === -Infinity) normalized = 0;
            else normalized = (num - min) / (max - min);
            newInner[subKey] = normalized;
        }
        output[key] = newInner;
    }
    return output;
}

export function normalizeParamTwoForColorsOriginal(input: NestedStringObject) {
    const output: Record<string, Record<string | number, number>> = {};
    for (const [groupKey, innerObj] of Object.entries(input)) {
        const finiteValues: number[] = [];
        // Estrai solo valori finiti del gruppo
        for (const raw of Object.values(innerObj)) {
            const num = Number(raw);
            if (Number.isFinite(num)) finiteValues.push(num);
        }
        const min = Math.min(...finiteValues);
        const max = Math.max(...finiteValues);
        const newInner: Record<string | number, number> = {};
        for (const [subKey, raw] of Object.entries(innerObj)) {
            const num = Number(raw);
            let normalized: number;
            if (num === Infinity) normalized = 1;
            else if (num === -Infinity) normalized = 0;
            else normalized = (num - min) / (max - min);
            newInner[subKey] = normalized;
        }
        output[groupKey] = newInner;
    }
    return output;
}


export const onNormalizeColorScale = async (components: OBC.Components, target:BUI.Checkbox, uvl:string) => {
    if (!target) return
    const highlighter = components.get(OBCF.Highlighter)
    const fragments = components.get(OBC.FragmentsManager)
    addOverlay(BUI.html`Loading... Please wait a few seconds...`)
    const check = target.value //legge il valore prima che venga aggiornato il bottone
    //console.log(check)
    //console.log('clear highlighter')
    //console.log(originalHighlighters)
    highlighter.clear(`LOD_${uvl}_color_0_02`)
    highlighter.clear(`LOD_${uvl}_color_02_04`)
    highlighter.clear(`LOD_${uvl}_color_04_06`)
    highlighter.clear(`LOD_${uvl}_color_06_08`)
    highlighter.clear(`LOD_${uvl}_color_08_1`)
    const mergedUvlModels: Record<string, Record<string | number, string>> = {}
    for (const [modelName,model] of fragments.list.entries()) {
        if (model.isDeltaModel) continue
        if (modelName.includes(`LOD_${uvl}_`)) {
            mergedUvlModels[modelName] = {}
            //console.log(modelName)
            const items = await model.getItems()
            // get attributes and relations of bar
            const barsData = await fragments.getData({[modelName]:new Set(items.keys())},{
                attributesDefault: true,
                relationsDefault: {
                    attributes: true,
                    relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                }
            })
            // get color of bar
            for (const itemData of barsData[modelName]){
                // get all psets localids of bar
                const itemId = (itemData._localId as FRAGS.ItemAttribute).value as number
                //const itemIs = itemData.
                const pSetsLocalIds: FRAGS.Identifier[] = [];
                (itemData.IsDefinedBy as FRAGS.ItemData[]).forEach((x:FRAGS.ItemData) => { //questo legge l'id del pset collegato dall'attributo IsDefinedBy della barra -> il ciclo serve se ci sono piu pset, restituisce tutti gli id
                    pSetsLocalIds.push((x._localId as FRAGS.ItemAttribute).value)
                })
                //get psets data of previous local ids
                let pSets = await model.getItemsData(pSetsLocalIds)
                pSets = pSets.filter(item => (item.Name as FRAGS.ItemAttribute).value == 'EnvironmentalAnalysisData') //mantiene solo i pset con quel nome
                //const param1 = (pSets[0][Object.keys(pSets[0])[7]] as FRAGS.ItemAttribute).value //HEIGHT e' sempre 7 per come e' scritto il pset
                let paramColor
                if (uvl=="21"){ //distinzione tra uvl 21 e gli altri perchè per il 21 devi scegliere uno dei due parametri e quindi il pset ha due proprietà in meno
                    paramColor = (pSets[0][Object.keys(pSets[0])[6]] as FRAGS.ItemAttribute).value //COLOR e' sempre 6 per come e' scritto il pset
                } else {
                    paramColor = (pSets[0][Object.keys(pSets[0])[8]] as FRAGS.ItemAttribute).value //COLOR e' sempre 8 per come e' scritto il pset
                }
                mergedUvlModels[modelName][itemId] = paramColor
            }
        }
    }
    //console.log('uvl',uvl)
    //console.log('mergedUvlModels',mergedUvlModels)
    let normalizedMergedUvlModels
    if (check) {
        normalizedMergedUvlModels = normalizeParamTwoForColorsOriginal(mergedUvlModels)
    } else {
        normalizedMergedUvlModels = normalizeParamTwoForColorsNormalization(mergedUvlModels)
    }
    //console.log('normalizedMergedUvlModels',normalizedMergedUvlModels)
    for (const [modelName, itemsList] of Object.entries(normalizedMergedUvlModels)){
        for (const [itemId, value] of Object.entries(itemsList)) {
            const range = colorForValue(value)
            highlighter.highlightByID(`LOD_${uvl}_${range}`,{[modelName]:new Set<number>([Number(itemId)])},false,false)
        }
    }
    addOverlay(BUI.html`Color map updated!`)
}

export const paramLabelToValue = ((value:string|undefined) => {
    const paramConversionMap: Record<string, string> = {
        '1': '1',
        'Urban area (km²)': 'Urban area (km²)',
        'Population (number)': 'Population',
        'Building height (m)': 'BLDGHEI',
        'Building footprint area (m²)': 'grnd_fl',
        'Building gross floor area (m²)': 'grss_fl',
        'Building net floor area (m²)': 'usbl_fl',
        'Building weight (tonnes)': 'Tonnes',
        'All materials': 'All materials',
        'Aluminium': 'Aluminm',
        'Bitumen': 'Bitumen',
        'Carpet': 'Carpet',
        'Ceramics': 'Ceramcs',
        'Concrete': 'Concret',
        'Copper': 'Copper',
        'Glass': 'Glass',
        'Insulation': 'Insultn',
        'Paint': 'Paint',
        'Plasterboard': 'Plstrbr',
        'Plastics': 'Plastcs',
        'Sand and stone': 'Snd_nd_',
        'Steel': 'Steel',
        'Timber': 'Timber',
        'Weight (tonnes)': 'weight',
        'Global Warming Potential (kg CO₂ eq)': 'Global warming (GWP100a)',
        'Abiotic Depletion - elem., econ. reserve (kg SB eq)': 'Abiotic depletion (elem., econ. reserve)',
        'Abiotic depletion - fossil fuels (MJ NCV)': 'Abiotic depletion (Fossil fuels)',
        'Ozone Layer Depletion (kg CFC-11 eq)': 'Ozone layer depletion (ODP)',
        'Photochemical Oxidation (kg C2H4 eq)': 'Photochemical oxidation',
        'Acidification (kg SO2 eq)': 'Acidification',
        'Eutrophication (kg PO4--- eq)': 'Eutrophication',
        'Particulate Matter (kg PM2.5)': 'Particulate matter',
        'Human toxicity - cancer (CTUh)': 'Human toxicity, cancer',
        'Human toxicit - non-cancer (CTUh)': 'Human toxicity, non-cancer',
        'Freshwater Ecotoxicity (CTUe)': 'Freshwater ecotoxicity',
        'Ionizing Radiation H (kBq U235 eq)': 'Ionizing radiation HH',
        'Water Scarcity (m3 eq)': 'Water Scarcity',
    }
    return value ? paramConversionMap[value] : undefined
})

export const valueToParamLabel = ((value: string | undefined) => {
    const inverseParamConversionMap: Record<string, string> = {
        '1': '1',
        'Urban area (km²)': 'Urban area (km²)',
        'Population': 'Population (number)',
        'BLDGHEI': 'Building height (m)',
        'grnd_fl': 'Building footprint area (m²)',
        'grss_fl': 'Building gross floor area (m²)',
        'usbl_fl': 'Building net floor area (m²)',
        'Tonnes': 'Building weight (tonnes)',
        'All materials': 'All materials',
        'Aluminm': 'Aluminium',
        'Bitumen': 'Bitumen',
        'Carpet': 'Carpet',
        'Ceramcs': 'Ceramics',
        'Concret': 'Concrete',
        'Copper': 'Copper',
        'Glass': 'Glass',
        'Insultn': 'Insulation',
        'Paint': 'Paint',
        'Plstrbr': 'Plasterboard',
        'Plastcs': 'Plastics',
        'Snd_nd_': 'Sand and stone',
        'Steel': 'Steel',
        'Timber': 'Timber',
        'weight': 'Weight (tonnes)',
        'Global warming (GWP100a)': 'Global Warming Potential (kg CO₂ eq)',
        'Abiotic depletion (elem., econ. reserve)': 'Abiotic Depletion - elem., econ. reserve (kg SB eq)',
        'Abiotic depletion (Fossil fuels)': 'Abiotic depletion - fossil fuels (MJ NCV)',
        'Ozone layer depletion (ODP)': 'Ozone Layer Depletion (kg CFC-11 eq)',
        'Photochemical oxidation': 'Photochemical Oxidation (kg C2H4 eq)',
        'Acidification': 'Acidification (kg SO2 eq)',
        'Eutrophication': 'Eutrophication (kg PO4--- eq)',
        'Particulate matter': 'Particulate Matter (kg PM2.5)',
        'Human toxicity, cancer': 'Human toxicity - cancer (CTUh)',
        'Human toxicity, non-cancer': 'Human toxicit - non-cancer (CTUh)',
        'Freshwater ecotoxicity': 'Freshwater Ecotoxicity (CTUe)',
        'Ionizing radiation HH': 'Ionizing Radiation H (kBq U235 eq)',
        'Water Scarcity': 'Water Scarcity (m3 eq)',
    }
    return value ? inverseParamConversionMap[value] : undefined
})

