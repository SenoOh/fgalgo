export async function makeUserTuple(json) {
    const tuples = []

    for (const user of json) {
        const userId = user.uid
        for (const [key, value] of Object.entries(user)) {
        if (key === 'id' || key === 'uid' || key === 'name') continue
        if (!value || value.length === 0) continue

        const values = Array.isArray(value) ? value : [value]

        for (const v of values) {
            tuples.push({
            user: `user:${userId}`,
            relation: 'member',
            object: `${key}:${v}`
            })
        }
        }
    }
    return tuples;
}
