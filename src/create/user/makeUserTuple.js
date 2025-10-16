export async function makeUserTuple(userAttrJson, userGroupsJson) {
    const tuples = []

    // ユーザ属性からタプルを生成
    for (const user of userAttrJson) {
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

    // グループ間の親子関係からタプルを生成
    for (const group of userGroupsJson) {
        if (group.parent && group.parent.trim() !== '') {
            tuples.push({
                user: `group:${group.parent}`,
                relation: 'parent',
                object: `group:${group.uid}`
            })
        }
    }

    return tuples;
}
