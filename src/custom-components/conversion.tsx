import type { Table } from "apache-arrow"

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
            if (colFilter.get(i) === valueForFilter) {
                result = col.get(i); // otteniamo il valore corrispondente
                return result
            }
        }
    } else {
        for (let i = 0; i < colFilter.length; i++) {
            if (Number(colFilter.get(i)) === valueForFilter) {
                result = col.get(i); // otteniamo il valore corrispondente
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