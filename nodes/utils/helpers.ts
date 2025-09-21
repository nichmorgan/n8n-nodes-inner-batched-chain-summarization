import type { IDataObject, IExecuteFunctions, ISupplyDataFunctions } from 'n8n-workflow';

export function getMetadataFiltersValues(
	ctx: IExecuteFunctions | ISupplyDataFunctions,
	itemIndex: number,
): IDataObject | undefined {
	const metadata = ctx.getNodeParameter('options.metadata.metadataValues', itemIndex, []) as
		| Array<{
				name: string;
				value: string;
		  }>
		| undefined;

	if (metadata && Array.isArray(metadata) && metadata.length > 0) {
		return metadata.reduce((acc, item) => {
			acc[item.name] = item.value;
			return acc;
		}, {} as IDataObject);
	}

	return undefined;
}
