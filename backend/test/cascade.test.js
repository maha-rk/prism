const { cascade, orderedCascadeSteps, REAL_PROVIDERS } = require('../shared/cascade');

describe('cascade', () => {
  it('returns the primary result when it succeeds', async () => {
    const primary = vi.fn().mockResolvedValue('primary-ok');
    const secondary = vi.fn().mockResolvedValue('secondary-ok');
    const result = await cascade([
      { label: 'primary', fn: primary },
      { label: 'secondary', fn: secondary },
    ]);
    expect(result).toBe('primary-ok');
    expect(secondary).not.toHaveBeenCalled();
  });

  it('falls through to the next step when an earlier one throws', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary down'));
    const secondary = vi.fn().mockResolvedValue('secondary-ok');
    const result = await cascade([
      { label: 'primary', fn: primary },
      { label: 'secondary', fn: secondary },
    ]);
    expect(result).toBe('secondary-ok');
  });

  it('falls all the way through three steps', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('down'));
    const secondary = vi.fn().mockRejectedValue(new Error('also down'));
    const tertiary = vi.fn().mockResolvedValue('tertiary-ok');
    const result = await cascade([
      { label: 'primary', fn: primary },
      { label: 'secondary', fn: secondary },
      { label: 'tertiary', fn: tertiary },
    ]);
    expect(result).toBe('tertiary-ok');
  });

  it('throws the last error when every step fails', async () => {
    const err1 = new Error('first fail');
    const err2 = new Error('second fail');
    await expect(
      cascade([
        { label: 'a', fn: () => Promise.reject(err1) },
        { label: 'b', fn: () => Promise.reject(err2) },
      ])
    ).rejects.toThrow('second fail');
  });
});

describe('orderedCascadeSteps', () => {
  const providers = {
    watsonx: () => 'watsonx-fn',
    gemini: () => 'gemini-fn',
    local: () => 'local-fn',
  };

  it('puts the configured primary provider first', () => {
    expect(orderedCascadeSteps('gemini', providers).map((s) => s.label)).toEqual(['gemini', 'watsonx', 'local']);
  });

  it('always puts local last unless local is primary', () => {
    expect(orderedCascadeSteps('watsonx', providers).map((s) => s.label)).toEqual(['watsonx', 'gemini', 'local']);
  });

  it('puts local first when local is the configured primary', () => {
    expect(orderedCascadeSteps('local', providers).map((s) => s.label)[0]).toBe('local');
  });

  it('omits providers that were not supplied', () => {
    const partial = { watsonx: () => {}, local: () => {} };
    expect(orderedCascadeSteps('watsonx', partial).map((s) => s.label)).toEqual(['watsonx', 'local']);
  });

  it('exposes the three recognized real-provider values', () => {
    expect(REAL_PROVIDERS).toEqual(['watsonx', 'gemini', 'local']);
  });
});
