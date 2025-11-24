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
export function getArrowLineValue (arrowFile:Table<any>, columnToGetValue:string, ColumnForFilter:string, valueForFilter:string): typeof result {
    const col = arrowFile.getChild(columnToGetValue)
    const colFilter = arrowFile.getChild(ColumnForFilter)
    if (!col || !colFilter) return
    let result: number|string|undefined = undefined
    for (let i = 0; i < colFilter.length; i++) {
        if (colFilter.get(i) === valueForFilter) {
            result = col.get(i); // otteniamo il valore corrispondente
            return result
        }
    }
}