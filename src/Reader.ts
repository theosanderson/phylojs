import { Tree } from './Tree';
import { Node } from './Node';

type Token = [string, string, number];

class SkipTreeException extends Error {}
class ParseException {
  message: string;

  constructor(
    message: string,
    context?: { left: string; at: string; right: string }
  ) {
    this.message = message;

    if (context !== undefined) {
      this.message +=
        '<br><br>' +
        'Error context:<br> "... ' +
        context.left +
        "<span class='cursor'>" +
        context.at +
        '</span>' +
        context.right +
        ' ... "';
    }
  }
}

const tokens: [string, RegExp, boolean, number?][] = [
  ['OPENP', /^\(/, false],
  ['CLOSEP', /^\)/, false],
  ['COLON', /^:/, false],
  ['COMMA', /^,/, false],
  ['SEMI', /^;/, false],
  ['OPENA', /^\[&/, false],
  ['CLOSEA', /^\]/, false],
  ['OPENV', /^{/, false],
  ['CLOSEV', /^}/, false],
  ['EQ', /^=/, false],
  ['HASH', /#/, false],
  ['STRING', /^"(?:[^"]|"")+"/, true],
  ['STRING', /^'(?:[^']|'')+'/, true],
  ['STRING', /^[^,():;[\]#]+(?:\([^)]*\))?/, true, 0],
  ['STRING', /^[^,[\]{}=]+/, true, 1],
];

export function readNewick(newick: string): Tree {
  const tokenList = doLex(newick);
  const rootNode = doParse(tokenList, newick);

  const tree = new Tree(rootNode);
  if (tree.root.branchLength === 0.0) {
    tree.root.branchLength = undefined;
  }

  return tree;
}

function doLex(newick: string): Token[] {
  const tokenList: Token[] = [];
  let idx = 0;

  // Lexer has two modes: 0 (default) and 1 (attribute mode)
  let lexMode = 0;

  while (idx < newick.length) {
    // Skip over whitespace:
    const wsMatch = /^\s/.exec(newick.slice(idx));
    if (wsMatch !== null && wsMatch.index === 0) {
      idx += wsMatch[0].length;
      continue;
    }

    let matchFound = false;
    for (let k = 0; k < tokens.length; k++) {
      // Skip lexer rules not applying to mode:
      if (tokens[k].length > 3 && tokens[k][3] !== lexMode) {
        continue;
      }

      const match = tokens[k][1].exec(newick.slice(idx));
      if (match !== null && match.index === 0) {
        let value = match[0];

        if (tokens[k][2]) {
          if (tokens[k][0] === 'STRING') {
            value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
            value = value.replace("''", "'").replace('""', '"');
          }
        }

        tokenList.push([tokens[k][0], value, idx]);

        switch (tokens[k][0]) {
          case 'OPENA':
            lexMode = 1;
            break;
          case 'CLOSEA':
            lexMode = 0;
            break;
          default:
            break;
        }

        matchFound = true;
        idx += match[0].length;
        break;
      }
    }

    if (!matchFound) {
      throw new ParseException(
        `Error reading character ${newick[idx]} at position ${idx}`
      );
    }
  }

  return tokenList;
}

function doParse(tokenList: Token[], newick: string): Node {
  let thisNodeID = 0;

  let idx = 0;
  const treeRoot = ruleT();
  return treeRoot;

  function getContext(flank: number) {
    const strIdx = tokenList[idx][2];
    const startIdx = strIdx >= flank ? strIdx - flank : 0;
    const stopIdx =
      newick.length - strIdx >= flank ? strIdx + flank : newick.length;

    return {
      left: newick.slice(startIdx, strIdx),
      at: newick[strIdx],
      right: newick.slice(strIdx + 1, stopIdx),
    };
  }

  function acceptToken(token: string, mandatory: boolean) {
    if (idx < tokenList.length && tokenList[idx][0] === token) {
      idx += 1;
      return true;
    } else {
      if (mandatory)
        if (idx < tokenList.length) {
          throw new ParseException(
            `Expected token <b>${token}</b> but found <b>${tokenList[idx][0]}</b> (${tokenList[idx][1]}) at string position <b>${tokenList[idx][2]}</b>.`,
            getContext(15)
          );
        } else {
          throw new ParseException(
            'Newick string terminated early. Expected token ' + token + '.'
          );
        }
      else return false;
    }
  }

  function ruleT() {
    const node = ruleN(undefined);

    if (!acceptToken('SEMI', false) && acceptToken('COMMA', false))
      throw new ParseException('Tree/network with multiple roots found.');

    return node;
  }

  function ruleN(parent?: Node) {
    const node = new Node(thisNodeID++);
    if (parent !== undefined) parent.addChild(node);

    ruleC(node);
    ruleL(node);
    ruleH(node);
    ruleA(node);
    ruleB(node);

    return node;
  }

  function ruleC(node: Node) {
    if (acceptToken('OPENP', false)) {
      ruleN(node);
      ruleM(node);
      acceptToken('CLOSEP', true);
    }
  }

  function ruleM(node: Node) {
    if (acceptToken('COMMA', false)) {
      ruleN(node);
      ruleM(node);
    }
  }

  function ruleL(node: Node) {
    if (acceptToken('STRING', false)) {
      node.label = tokenList[idx - 1][1];
    }
  }

  function ruleH(node: Node) {
    if (acceptToken('HASH', false)) {
      acceptToken('STRING', true);
      node.hybridID = Number(tokenList[idx - 1][1]);
    }
  }
  function ruleA(node: Node) {
    if (acceptToken('OPENA', false)) {
      ruleD(node);
      ruleE(node);
      acceptToken('CLOSEA', true);
    }
  }
  function isStringOrStringArrayOrNull(
    value: RuleQResult
  ): value is string | string[] {
    return (
      typeof value === 'string' ||
      (Array.isArray(value) && value.every(item => typeof item === 'string')) ||
      value == null
    );
  }
  function ruleD(node: Node) {
    acceptToken('STRING', true);
    const key = tokenList[idx - 1][1];
    acceptToken('EQ', true);
    const value = ruleQ();
    if (isStringOrStringArrayOrNull(value)) {
      node.annotation[key] = value;
    }
  }

  type RuleQResult = string | RuleQResult[] | null;

  function ruleQ(): RuleQResult {
    let value;
    if (acceptToken('STRING', false)) value = tokenList[idx - 1][1];
    else if (acceptToken('OPENV', false)) {
      value = [ruleQ()].concat(ruleW());
      acceptToken('CLOSEV', true);
    } else value = null;

    return value;
  }

  function ruleW(): RuleQResult {
    if (acceptToken('COMMA', false)) {
      return [ruleQ()].concat(ruleW());
    } else return [];
  }

  function ruleE(node: Node) {
    if (acceptToken('COMMA', false)) {
      ruleD(node);
      ruleE(node);
    }
  }

  function ruleB(node: Node) {
    if (acceptToken('COLON', false)) {
      acceptToken('STRING', true);

      const length = Number(tokenList[idx - 1][1]);
      if (String(length) !== 'NaN') node.branchLength = length;
      else
        throw new ParseException(
          'Expected numerical branch length. Found ' +
            tokenList[idx - 1][1] +
            ' instead.'
        );

      ruleR();

      ruleA(node);
    }
  }

  function ruleR() {
    if (acceptToken('COLON', false)) {
      acceptToken('STRING', false);

      ruleR();
    }
  }
}

export function readPhyloXML(phyloXMLString: string): Tree {
  const parser = new DOMParser();
  const doc = parser.parseFromString(phyloXMLString, 'application/xml');
  const phylogenyElements = doc.getElementsByTagName('phylogeny');

  if (phylogenyElements.length === 0) {
    throw new Error('No phylogeny element found in phyloXML.');
  }
  if (phylogenyElements.length > 1) {
    throw new Error('Multiple phylogeny elements found in phyloXML.');
  }
  const phylogenyElement = phylogenyElements[0];
  const phyloXML = new PhyloXML(phylogenyElement);
  return new Tree(phyloXML.root);
}

// TreeFromPhyloXML constructor
export class PhyloXML {
  private thisNodeID = 0;
  public root: Node;

  constructor(phylogenyElement: Element) {
    this.root = this.walkDom(undefined, phylogenyElement);
    // Zero root edge length means undefined
    if (this.root.branchLength === 0.0) this.root.branchLength = undefined;
  }

  private annotateNode(node: Node, prefix: string, elements: HTMLCollection) {
    for (let j = 0; j < elements.length; j++) {
      const tname = elements[j].tagName;
      const tval = elements[j].textContent;
      node.annotation[prefix + '_' + tname] = tval;
    }
  }

  private walkDom(parent: Node | undefined, cladeElement: Element): Node {
    const node = new Node(this.thisNodeID++);
    if (parent !== undefined) parent.addChild(node);

    for (let i = 0; i < cladeElement.children.length; i++) {
      const childEl = cladeElement.children[i];
      const tagName = childEl.tagName;
      switch (tagName) {
        case 'clade':
          this.walkDom(node, childEl);
          break;
        case 'name':
          if (childEl.textContent) {
            node.label = childEl.textContent;
          }
          break;
        case 'taxonomy':
          this.annotateNode(node, 'taxonomy', childEl.children);
          break;
        case 'sequence':
          this.annotateNode(node, 'sequence', childEl.children);
          break;
        case 'confidence':
          node.annotation[`confidence_${childEl.getAttribute('type') || ''}`] =
            childEl.textContent;
          break;
        case 'branch_length':
          node.branchLength = Number(childEl.textContent);
          break;
        case 'property': {
          const refAttribute = childEl.getAttribute('ref');
          if (refAttribute) {
            // this checks both for null and empty string
            node.annotation[refAttribute] = childEl.textContent;
          }
          break;
        }
        default:
          break;
      }
    }
    const rootedAttribute = cladeElement.getAttribute('rooted');
    if (rootedAttribute && rootedAttribute.toLowerCase() === 'false')
      throw new SkipTreeException('Unrooted tree.');

    if (cladeElement.hasAttribute('branch_length'))
      node.branchLength = Number(cladeElement.getAttribute('branch_length'));

    return node;
  }
}
