// Incremental Server-Sent-Events parser. Works in Node and the browser.
// Handles events split across network reads (diffusing frames are >4KB and
// routinely span several chunks), CRLF line endings and multi-line data.

export function createSseParser(onData: (data: string) => void) {
  let buffer = '';
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length) {
      onData(dataLines.join('\n'));
      dataLines = [];
    }
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        processLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    /** Flush whatever is left when the stream ends. */
    end() {
      if (buffer) processLine(buffer);
      buffer = '';
      dispatch();
    },
  };
}
