import ejs from 'ejs';

export async function makeUserModel(json, userTemplatePath) {
    const relationTypes = new Set();

    for (const user of json) {
        for (const key of Object.keys(user)) {
            if (['id', 'uid', 'name'].includes(key)) continue;
            relationTypes.add(key);
        }
    }

    const modelFGA = await ejs.renderFile(userTemplatePath, {
        relationTypes: Array.from(relationTypes)
    });

    return modelFGA;
}
