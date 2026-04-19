import { readFile } from 'node:fs/promises';

const DOC_FILES = {
  privacy: new URL('../../avisoPrivacidad.md', import.meta.url),
  terms: new URL('../../terminosYCondiciones.md', import.meta.url),
};

export const getDocument = async (req, res, next) => {
  try {
    const { type } = req.params;
    const fileUrl = DOC_FILES[type];

    if (!fileUrl) {
      return res.status(404).json({ success: false, error: 'Documento legal no encontrado' });
    }

    const content = await readFile(fileUrl, 'utf8');
    return res.json({ success: true, data: { content } });
  } catch (err) {
    return next(err);
  }
};
