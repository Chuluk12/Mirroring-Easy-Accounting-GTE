import Stock from './Stock'

const STANDARD_CATEGORIES = ['Bahan Baku', 'Bahan Baku Pembantu']

export default function Standarisasi() {
  return (
    <Stock
      fixedCategories={STANDARD_CATEGORIES}
      pageTitle="Standarisasi"
      exportFilename="Standarisasi"
    />
  )
}
