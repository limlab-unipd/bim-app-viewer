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
export function convertUnits (unitMeasure:string): string{
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