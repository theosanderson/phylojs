import {
  Tree,
  readTreesFromNewick,
  readTreesFromNeXML,
  readTreesFromPhyloXML,
  readTreesFromNexus,
} from '../../';

type Schema = 'newick' | 'nexus' | 'phyloxml' | 'nexml';

export function read(text: string, schema: Schema = 'newick'): Tree[] {
  if (text.startsWith('http://') || text.startsWith('https://')) {
    throw new Error('Fetching trees from the internet is not yet supported');
  }
  switch (schema) {
    case 'newick':
      return readTreesFromNewick(text);
    case 'nexus':
      return readTreesFromNexus(text);
    case 'phyloxml':
      return readTreesFromPhyloXML(text);
    case 'nexml':
      return readTreesFromNeXML(text);
    default:
      throw new Error('Invalid schema');
  }
}
