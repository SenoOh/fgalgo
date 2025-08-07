import os
import json
import xml.etree.ElementTree as ET

def create_devicetypes_dict(devicetypes):
    devicetypes_dict = []
    for device_type in devicetypes:
        devicetypes_dict.append(create_devicetype_dict(device_type))
    return devicetypes_dict

def create_devicetype_dict(devicetype):
    name = devicetype.get('name', 'Unknown Device Type')
    device_id = devicetype.get('id', 'Unknown ID').lower()
    clusters = devicetype.get('clusters', [])
    data = {
        "id": device_id,
        "name": name,
        "clusters": clusters
    }
    return data

def create_clusters_dict(clusters):
    clusters_dict = []
    for cluster in clusters:
        clusters_dict.append(create_cluster_dict(cluster))
    return clusters_dict

def create_cluster_dict(cluster):
    name = cluster.get('name', 'Unknown Cluster')
    cluster_id = cluster.get('id', 'Unknown ID').lower()
    commands = cluster.get('commands', [])
    data = {
        "id": cluster_id,
        "name": name,
        "commands": commands
    }
    return data

def parse_device_type_info(xml_file):
    global all_clusters
    global all_devicetypes
    tree = ET.parse(xml_file)
    root = tree.getroot()

    results = []
    print("Parsing device types from XML...")

    for device_type in root.findall('deviceType'):
        device_info = {}
        device_id = device_type.find('deviceId')
        if device_id is not None:
            device_info['id'] = device_id.text.lower()

        name = device_type.find('name')
        if name is not None:
            device_info['name'] = name.text

        clusters = device_type.find('clusters')
        if clusters is not None:
            cluster_list = []
            for include in clusters.findall('include'):
                cluster = include.get('cluster')
                if cluster:
                    cluster_list.append(cluster)
            device_info['clusters'] = cluster_list

        results.append(device_info)
        all_devicetypes = create_devicetypes_dict(results)
    return all_devicetypes

def convert_to_camel_case(snake_str):
    components = snake_str.split('_')
    return ''.join(x.title() for x in components)

def parse_cluster_info(cluster_elem):
    cluster = {
        "name": cluster_elem.findtext("name"),
        "id": cluster_elem.findtext("code").lower(),
        "commands": [],
    }

    for cmd in cluster_elem.findall("command"):
        command = {
            "code": cmd.get("code"),
            "name": cmd.get("name"),
            # "source": cmd.get("source"),
            # "args": [],
        }
        # for arg in cmd.findall("arg"):
        #     command["args"].append({
        #         "name": arg.get("name"),
        #         "type": arg.get("type"),
        #     })
        cluster["commands"].append(command)

    return cluster

def parse_clusters_info(xml_dir):
    global all_clusters

    print("Parsing clusters from XML...")
    clusters = []
    for filename in os.listdir(xml_dir):
        if filename.endswith(".xml"):
            path = os.path.join(xml_dir, filename)
            tree = ET.parse(path)
            root = tree.getroot()
            for cluster_elem in root.findall("cluster"):
                cluster = parse_cluster_info(cluster_elem)
                clusters.append(cluster)
    all_clusters = create_clusters_dict(clusters)


    return all_clusters

def merge_device_clusters(devices, clusters):
    merged_data = []
    cluster_dict = {cluster['name']: cluster for cluster in clusters}

    for device in devices:
        merged_entry = {
            'id': device['id'],
            'name': device['name'],
            'clusters': []
        }
        for cluster_name in device['clusters']:
            if cluster_name in cluster_dict:
                merged_entry['clusters'].append(cluster_dict[cluster_name])
            else:
                print(f"クラスタ '{cluster_name}' が matter-clusters.json に存在しません")
        merged_data.append(merged_entry)

    return merged_data



global all_clusters
global all_devicetypes


base_dir = os.path.dirname(os.path.abspath(__file__))
xml_dir = os.path.join(base_dir, "../matter_xml")
xml_file = os.path.join(base_dir, "../matter_xml/matter-devices.xml")

# Parse device types
devices = parse_device_type_info(xml_file)

# Parse clusters
clusters = parse_clusters_info(xml_dir)

merged_data = merge_device_clusters(devices, clusters)


# Output results
# print("Device Types:")
# print(devices)
# with open(os.path.join(base_dir, "../file/json/matter/matter-devices.json"), "w") as f:
#     json.dump(devices, f, indent=2, ensure_ascii=False)

# # print("\nClusters:")
# # print(clusters)
# with open(os.path.join(base_dir, "../file/json/matter/matter-clusters.json"), "w") as f:
#     json.dump(clusters, f, indent=2, ensure_ascii=False)


print(f"Device Types の項目数: {len(devices)}")
print(f"Clusters の項目数: {len(clusters)}")

# with open(os.path.join(base_dir, '../file/json/matter/matter-based.json'), 'w', encoding='utf-8') as f:
#     json.dump(merged_data, f, indent=2, ensure_ascii=False)

# print(f"../file/json/matter/matter-based.json を生成しました。")

devicetype_names_to_remove = [
    "MA-rootdevice",
    "MA-controlbridge",
    "MA-network-infrastructure-manager",
    "MA-thread-border-router",
    "MA-all-clusters-app",
    "MA-secondary-network-interface"
]

# names_to_remove に記述されている名前を持つデバイスタイプを削除
filtered_data_with_devicetype_removed = [
    device for device in merged_data if device['name'] not in devicetype_names_to_remove
]

print("")
print("")
print("")
print("")
print("DeviceType Filtered Remove の名前一覧:")
for device in filtered_data_with_devicetype_removed:
    print(device['name'])


cluster_names_to_remove = [
    "Groups",
    "Identify"
]

# clusters 内の該当するクラスタを削除
filtered_data_with_clusters_removed = []
for device in filtered_data_with_devicetype_removed:
    filtered_device = {
        'id': device['id'],
        'name': device['name'],
        'clusters': [
            cluster for cluster in device['clusters'] if cluster['name'] not in cluster_names_to_remove
        ]
    }
    filtered_data_with_clusters_removed.append(filtered_device)


print(f"Filtered Device Types の項目数: {len(filtered_data_with_clusters_removed)}")


filtered_non_cluster = []
for device in filtered_data_with_clusters_removed:
    filtered_device = {
        'id': device['id'],
        'name': device['name'],
        'clusters': [
            cluster for cluster in device['clusters'] if cluster['commands']
        ]
    }
    filtered_non_cluster.append(filtered_device)


filtered_non_devicetype = [
    device for device in filtered_non_cluster if device['clusters']
]

# with open(os.path.join(base_dir, '../file/json/matter/matter.json'), 'w', encoding='utf-8') as f:
#     json.dump(filtered_non_devicetype, f, indent=2, ensure_ascii=False)

# print(f"../file/json/matter/matter.json を生成しました。")


print("")
print("")
print(f"Device Types の項目数: {len(filtered_non_devicetype)}")
print("")
print("")
print("Device Types の名前一覧:")
for device in filtered_non_devicetype:
    print(device['name'])


template_file_path = os.path.join(os.path.join(base_dir, "../file/json/device"), "devicetype.json")

# すべてのデバイスタイプを格納するリスト
all_devices_data = []

for device in filtered_non_devicetype:
    # デバイスタイプ名を生成
    device_name = device['name'].replace('MA-', '').replace(" ", "_").lower()

    # コマンド名を抽出
    command_names = set()
    for cluster in device['clusters']:
        for command in cluster['commands']:
            command_names.add(command['name'])
            
    command_names = list(sorted(command_names))

    # JSONデータを生成
    json_data = {
        "devicetype": device_name,
        "commands": command_names
    }

    # デバイスタイプのデータをリストに追加
    all_devices_data.append(json_data)

# すべてのデバイスタイプを1つのJSONファイルに保存
with open(template_file_path, 'w', encoding='utf-8') as json_file:
    json.dump(all_devices_data, json_file, ensure_ascii=False, indent=4)

print(f"{template_file_path} を生成しました。")