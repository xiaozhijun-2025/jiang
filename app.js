// ========== 全局错误处理 ==========
// 捕获未处理的错误，防止渲染崩溃
window.onerror = function(message, source, lineno, colno, error) {
  console.error('全局错误捕获:', message, source, lineno, colno, error);
  
  // 检查是否是 Cesium 渲染错误
  if (message && message.includes('Cannot read properties of undefined')) {
    console.warn('检测到渲染错误，尝试恢复...');
    
    // 尝试重新初始化 Cesium
    if (viewer && viewer.scene) {
      try {
        viewer.scene.requestRender();
      } catch (e) {
        console.error('重新渲染失败:', e);
      }
    }
  }
  
  // 返回 true 阻止默认错误处理
  return true;
};

// 捕获 Promise 未处理的拒绝
window.addEventListener('unhandledrejection', function(event) {
  console.error('未处理的 Promise 拒绝:', event.reason);
  event.preventDefault();
});

// ========== 模型验证工具 ==========
function isValidModelBuffer(arrayBuffer, extension) {
  if (!arrayBuffer || !arrayBuffer.byteLength || arrayBuffer.byteLength < 10) {
    return false;
  }
  
  // 检查文件签名（Magic Number）
  const header = new Uint8Array(arrayBuffer, 0, Math.min(16, arrayBuffer.byteLength));
  
  // glTF 2.0 binary (.glb) - 签名: 0x67 0x6C 0x54 0x46
  if (extension === '.glb') {
    return header.length >= 4 && header[0] === 0x67 && header[1] === 0x6C && 
           header[2] === 0x54 && header[3] === 0x46;
  }
  
  // glTF JSON (.gltf)
  if (extension === '.gltf') {
    try {
      const text = new TextDecoder().decode(header);
      return text.trimStart().startsWith('{');
    } catch (e) {
      return false;
    }
  }
  
  // OBJ (.obj)
  if (extension === '.obj') {
    try {
      const text = new TextDecoder().decode(header);
      return text.includes('v ') || text.includes('f ') || text.includes('mtl ');
    } catch (e) {
      return false;
    }
  }
  
  // OSGB 格式
  if (extension === '.osgb') {
    return arrayBuffer.byteLength > 100;
  }
  
  // 默认认为有效（如 JSON, b3dm 等）
  return true;
}

// ========== 数据 ==========
const envBefore = {
  name: 'XX露天矿区',
  location: '中国 · 某省某市',
  altitude: '1250 m',
  rainfall: '620 mm',
  slope: '28°',
  vegetation: '32%',
  waterQuality: 'IV类'
}

const envAfter = {
  name: 'XX露天矿区',
  location: '中国 · 某省某市',
  altitude: '1250 m',
  rainfall: '620 mm',
  slope: '18°',
  vegetation: '71%',
  waterQuality: 'II类'
}

let currentStage = 'before'
let viewer, beforeModel, afterModel, chart

// ========== 右侧信息 ==========
function updateInfoPanel() {
  const data = currentStage === 'before' ? envBefore : envAfter
  document.getElementById('stageText').innerText = currentStage === 'before' ? '修复前' : '修复后'
  document.getElementById('name').innerText = data.name
  document.getElementById('location').innerText = data.location
  document.getElementById('altitude').innerText = data.altitude
  document.getElementById('rainfall').innerText = data.rainfall
  document.getElementById('slope').innerText = data.slope
  document.getElementById('vegetation').innerText = data.vegetation
  document.getElementById('waterQuality').innerText = data.waterQuality
}

// ========== 图表 ==========
function initChart() {
  chart = echarts.init(document.getElementById('chart'))
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function(params) {
        let result = params[0].name + '<br/>';
        params.forEach(item => {
          result += item.marker + item.seriesName + ': ' + item.value;
          if (item.name.includes('覆盖率')) {
            result += '%';
          }
          result += '<br/>';
        });
        return result;
      }
    },
    legend: {
      data: ['修复前', '修复后'],
      top: '0%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['植被覆盖率', '水质评分'],
      axisLabel: {
        interval: 0,
        rotate: 0
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '植被覆盖率 (%)',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: {
          formatter: '{value}%'
        }
      },
      {
        type: 'value',
        name: '水质评分',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: {
          formatter: '{value}分'
        }
      }
    ],
    series: [
      {
        name: '修复前',
        type: 'bar',
        data: [
          {value: 32, itemStyle: {color: '#ff7875'}},
          {value: 40, itemStyle: {color: '#ff7875'}}
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      },
      {
        name: '修复后',
        type: 'bar',
        data: [
          {value: 71, itemStyle: {color: '#67c23a'}},
          {value: 80, itemStyle: {color: '#67c23a'}}
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  })
  window.addEventListener('resize', () => chart.resize())
}

// ========== 切换前后 ==========
function switchModel(type) {
  try {
    if (typeof Cesium === 'undefined') {
      // Cesium 未加载时，只更新信息面板
      currentStage = type
      updateInfoPanel()
      return
    }
    
    currentStage = type

    // 处理不同类型的模型
    if (beforeModel && afterModel) {
      try {
        if (type === 'before') {
          // 显示修复前模型，隐藏修复后模型
          setModelVisibility(beforeModel, true);
          setModelVisibility(afterModel, false);
        } else {
          // 显示修复后模型，隐藏修复前模型
          setModelVisibility(beforeModel, false);
          setModelVisibility(afterModel, true);
        }
      } catch (switchError) {
        console.error('模型切换失败:', switchError);
      }
    }

    updateInfoPanel()
  } catch (error) {
    console.error('switchModel 函数执行失败:', error);
  }
}

function setModelVisibility(model, visible) {
  try {
    if (!model) {
      console.warn('setModelVisibility: 模型未定义');
      return;
    }
    
    // 检查模型是否已被销毁或不再有效
    if (model.isDestroyed && model.isDestroyed()) {
      console.warn('setModelVisibility: 模型已被销毁');
      return;
    }
    
    // 处理实体类型模型
    if (model.show !== undefined && typeof model.show === 'boolean') {
      model.show = visible;
      return;
    }
    
    // 处理3D Tileset类型模型
    if (model instanceof Cesium.Cesium3DTileset) {
      model.show = visible;
      return;
    }
    
    // 处理showInViewport方法
    if (typeof model.showInViewport === 'function') {
      model.showInViewport(visible);
      return;
    }
    
    console.warn('setModelVisibility: 无法设置模型可见性，未知的模型类型');
    
  } catch (error) {
    console.error('设置模型可见性失败:', error);
  }
}

// ========== 地图 ==========
function initCesium() {
  try {
    // 不设置Ion token，避免依赖Ion服务
    // Cesium.Ion.defaultAccessToken = '';
    
    // 创建 viewer 前先检查容器
    const container = document.getElementById('cesiumContainer');
    if (!container) {
      throw new Error('Cesium容器未找到');
    }
    
    viewer = new Cesium.Viewer('cesiumContainer', {
      animation: false,
      timeline: false,
      baseLayerPicker: false, // 禁用底图选择器，避免Ion服务依赖
      geocoder: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: true,
      // 使用更可靠的地图瓦片服务
      imageryProvider: new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        credit: '© Esri'
      }),
      // 不使用地形图层，避免Ion服务依赖
      terrainProvider: undefined,
      // 启用大气效果
      atmosphere: true,
      // 禁用Ion默认的天空盒，使用本地资源
      skyBox: undefined
    })

    // 示例矿区坐标（中国四川）
    const lng = 104.06
    const lat = 30.67
    const height = 1000

    // 直接添加标记点，不尝试加载模型（避免404错误）
    beforeModel = viewer.entities.add({
      name: '修复前矿区',
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      point: {
        pixelSize: 10,
        color: Cesium.Color.RED
      },
      label: {
        text: '修复前',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15)
      }
    })

    afterModel = viewer.entities.add({
      name: '修复后矿区',
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      point: {
        pixelSize: 10,
        color: Cesium.Color.GREEN
      },
      label: {
        text: '修复后',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15)
      },
      show: false
    })

    // 飞行到矿区位置，设置合适的视角
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, 3500),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0
      },
      duration: 3.0
    })

    // 点击模型切换状态
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((movement) => {
      try {
        if (!viewer || !viewer.scene) return;
        
        const picked = viewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && picked.id) {
          if (picked.id === beforeModel) {
            switchModel('before');
          } else if (picked.id === afterModel) {
            switchModel('after');
          }
        }
      } catch (error) {
        console.error('点击事件处理失败:', error);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    
    // 添加渲染错误处理（检查是否存在该事件）
    if (viewer.scene.renderError && typeof viewer.scene.renderError.addEventListener === 'function') {
      viewer.scene.renderError.addEventListener(function(scene, error) {
        console.error('Cesium 渲染错误:', error);
        // 尝试恢复渲染
        try {
          viewer.scene.requestRender();
        } catch (e) {
          console.error('渲染恢复失败:', e);
        }
      });
    }
    
    // 添加帧错误处理（检查是否存在该事件）
    if (viewer.scene.frameError && typeof viewer.scene.frameError.addEventListener === 'function') {
      viewer.scene.frameError.addEventListener(function(scene, error) {
        console.error('Cesium 帧错误:', error);
      });
    }
    
    // 补丁 Cesium 的 tryAndCatchError 函数，防止渲染循环崩溃
    if (viewer.scene && typeof viewer.scene.tryAndCatchError === 'function') {
      const originalTryAndCatchError = viewer.scene.tryAndCatchError.bind(viewer.scene);
      viewer.scene.tryAndCatchError = function(func) {
        try {
          return originalTryAndCatchError(func);
        } catch (error) {
          console.error('Cesium 渲染错误已捕获:', error);
          // 尝试恢复渲染
          try {
            viewer.scene.requestRender();
          } catch (e) {
            console.error('渲染恢复失败:', e);
          }
          return undefined;
        }
      };
    }
    
  } catch (error) {
    console.error('Cesium 初始化失败:', error)
    // 初始化失败时的降级处理
    const container = document.getElementById('cesiumContainer')
    if (container) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column;">
          <p style="color: #666; margin-bottom: 10px;">地图初始化失败</p>
          <p style="color: #999; font-size: 14px;">错误: ${error.message}</p>
          <p style="color: #999; font-size: 14px; margin-top: 10px;">请检查网络连接和Cesium库是否正确加载</p>
        </div>
      `
    }
  }
}

// ========== 绑定按钮 ==========
document.getElementById('btnBefore').addEventListener('click', () => switchModel('before'))
document.getElementById('btnAfter').addEventListener('click', () => switchModel('after'))

// ========== 地图图层切换 ==========
function initMapLayerSwitch() {
  const layerSelect = document.getElementById('mapLayerSelect');
  if (layerSelect) {
    layerSelect.addEventListener('change', function() {
      switchMapLayer(this.value);
    });
  }
}

function switchMapLayer(layerType) {
  try {
    if (typeof Cesium === 'undefined' || !viewer || !viewer.imageryLayers) {
      console.warn('switchMapLayer: Cesium未初始化或viewer无效');
      return;
    }
    
    // 移除现有的图层
    viewer.imageryLayers.removeAll();
    
    // 添加新的图层
    let imageryProvider;
  
  switch (layerType) {
    case 'satellite':
      imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
      });
      break;
    case 'topo':
      imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        credit: '© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
      });
      break;
    case 'street':
    default:
      imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        credit: '© Esri, NAVTEQ, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), MapmyIndia, and the GIS User Community'
      });
      break;
  }
  
    viewer.imageryLayers.addImageryProvider(imageryProvider);
    
  } catch (error) {
    console.error('切换地图图层失败:', error);
  }
}

// ========== 搜索与定位功能 ==========
function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  
  if (searchInput && searchBtn) {
    // 绑定搜索按钮点击事件
    searchBtn.addEventListener('click', performSearch);
    
    // 绑定回车键事件
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }
}

function performSearch() {
  try {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) {
      console.error('performSearch: 搜索输入框未找到');
      return;
    }
    
    const query = searchInput.value.trim();
    
    if (!query) {
      alert('请输入搜索内容');
      return;
    }
    
    if (typeof Cesium === 'undefined' || !viewer) {
      alert('地图未初始化');
      return;
    }
    
    // 这里使用Cesium的地理编码服务
    // 实际项目中可能需要使用更可靠的地理编码服务
    searchLocation(query);
    
  } catch (error) {
    console.error('搜索执行失败:', error);
  }
}

function searchLocation(query) {
  // 模拟地理编码结果
  // 实际项目中应该调用地理编码API
  const locations = {
    '北京': { lng: 116.4074, lat: 39.9042, height: 1000 },
    '上海': { lng: 121.4737, lat: 31.2304, height: 1000 },
    '广州': { lng: 113.2644, lat: 23.1291, height: 1000 },
    '深圳': { lng: 114.0579, lat: 22.5431, height: 1000 },
    '成都': { lng: 104.0668, lat: 30.5728, height: 1000 },
    '桂林': { lng: 110.2993, lat: 25.2741, height: 1500 },
    '矿区': { lng: 104.06, lat: 30.67, height: 3500 },
    '矿山': { lng: 104.06, lat: 30.67, height: 3500 }
  };
  
  // 检查是否有匹配的位置
  const location = locations[query];
  if (location) {
    flyToLocation(location.lng, location.lat, location.height);
  } else {
    // 如果没有匹配的位置，尝试使用Cesium的地理编码
    try {
      // 这里可以调用真实的地理编码API
      alert('未找到该位置，请尝试其他关键词');
    } catch (error) {
      console.error('地理编码失败:', error);
      alert('搜索失败，请重试');
    }
  }
}

function flyToLocation(lng, lat, height) {
  try {
    if (typeof Cesium === 'undefined' || !viewer) {
      console.warn('flyToLocation: Cesium未初始化');
      return;
    }
    
    if (!viewer.camera) {
      console.warn('flyToLocation: 相机对象未定义');
      return;
    }
  
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0
      },
      duration: 3.0
    });
    
  } catch (error) {
    console.error('飞行到位置失败:', error);
  }
}

// ========== 文件上传功能 ==========
function initFileUpload() {
  const beforeInput = document.getElementById('beforeModel');
  const afterInput = document.getElementById('afterModel');
  const uploadBtn = document.getElementById('btnUpload');
  
  if (beforeInput && afterInput && uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      uploadModel(beforeInput, 'before');
      uploadModel(afterInput, 'after');
    });
  }
}

function uploadModel(input, type) {
  try {
    console.log(`[${type}] 开始上传模型...`);
    
    // 检查输入元素
    if (!input || !input.files) {
      console.error(`[${type}] 无效的文件输入`);
      updateUploadStatus(type, '无效的文件输入');
      return;
    }
    
    const files = input.files;
    if (files.length === 0) {
      console.log(`[${type}] 未选择文件`);
      updateUploadStatus(type, '请选择文件');
      return;
    }
    
    console.log(`[${type}] 选择了 ${files.length} 个文件`);
    
    // 支持的文件类型：3D Tiles 格式和其他模型格式
    const allowedTypes = ['.json', '.b3dm', '.pnts', '.i3dm', '.cmpt', '.osgb', '.obj', '.glb', '.gltf'];
    let validFiles = [];
    
    // 过滤出有效的文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      if (allowedTypes.includes(fileExtension)) {
        validFiles.push(file);
        console.log(`[${type}] 有效文件: ${file.name} (${file.size} bytes)`);
      } else {
        console.log(`[${type}] 跳过不支持的文件: ${file.name} (${fileExtension})`);
      }
    }
    
    if (validFiles.length === 0) {
      console.log(`[${type}] 未找到支持的文件格式`);
      updateUploadStatus(type, '未找到支持的文件格式');
      return;
    }
    
    updateUploadStatus(type, `正在上传 ${validFiles.length} 个文件...`);
    
    // 存储所有文件的ArrayBuffer
    const fileBuffers = [];
    let filesLoaded = 0;
    
    // 读取所有文件
    validFiles.forEach((file, index) => {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          console.log(`[${type}] 文件读取完成: ${file.name}`);
          
          fileBuffers.push({
            buffer: e.target.result,
            extension: '.' + file.name.split('.').pop().toLowerCase(),
            name: file.name,
            fullPath: file.webkitRelativePath || file.name // 获取相对路径（用于3D Tiles）
          });
          filesLoaded++;
          
          console.log(`[${type}] 已加载 ${filesLoaded}/${validFiles.length} 个文件`);
          
          // 当所有文件都加载完成后，处理模型
          if (filesLoaded === validFiles.length) {
            console.log(`[${type}] 所有文件加载完成，开始处理模型...`);
            
            // 检查是否包含 tileset.json（3D Tiles 的入口文件）
            const hasTileset = fileBuffers.some(f => f.name.toLowerCase() === 'tileset.json');
            if (hasTileset) {
              console.log(`[${type}] 检测到3D Tiles格式，尝试加载...`);
              // 尝试加载 3D Tiles，如果失败则回退到普通模型加载
              try {
                load3DTilesModel(fileBuffers, type);
              } catch (tilesetError) {
                console.warn('3D Tiles 加载失败，尝试普通模型加载:', tilesetError.message);
                loadModelFromBuffers(fileBuffers, type);
              }
            } else {
              console.log(`[${type}] 尝试普通模型加载...`);
              loadModelFromBuffers(fileBuffers, type);
            }
            updateUploadStatus(type, `上传成功 (${validFiles.length} 个文件)`);
          }
        } catch (error) {
          console.error(`[${type}] 文件处理失败:`, error);
          filesLoaded++;
        }
      };
      
      reader.onerror = function(event) {
        console.error(`[${type}] 文件读取错误: ${file.name}`, event.target.error);
        filesLoaded++;
        if (filesLoaded === validFiles.length && fileBuffers.length > 0) {
          const hasTileset = fileBuffers.some(f => f.name.toLowerCase() === 'tileset.json');
          if (hasTileset) {
            load3DTilesModel(fileBuffers, type);
          } else {
            loadModelFromBuffers(fileBuffers, type);
          }
          updateUploadStatus(type, `部分文件上传失败，成功 ${fileBuffers.length} 个`);
        } else if (filesLoaded === validFiles.length) {
          updateUploadStatus(type, '所有文件上传失败');
        }
      };
      
      reader.onabort = function() {
        console.warn(`[${type}] 文件读取被中止: ${file.name}`);
        filesLoaded++;
      };
      
      console.log(`[${type}] 开始读取文件: ${file.name}`);
      reader.readAsArrayBuffer(file);
    });
    
  } catch (error) {
    console.error(`[${type}] 上传过程出错:`, error);
    updateUploadStatus(type, '上传出错: ' + error.message);
  }
}

function loadModelFromBuffer(arrayBuffer, extension, type) {
  try {
    if (typeof Cesium === 'undefined' || !viewer || !viewer.entities) {
      console.error('Cesium 未初始化');
      throw new Error('Cesium 未初始化');
    }
    
    const lng = 104.06;
    const lat = 30.67;
    const height = 1000;
    
    // 移除旧模型
    if (type === 'before' && beforeModel) {
      removeModel(beforeModel);
    } else if (type === 'after' && afterModel) {
      removeModel(afterModel);
    }
    
    // 检查arrayBuffer是否有效
    if (!arrayBuffer || !arrayBuffer.byteLength || arrayBuffer.byteLength === 0) {
      throw new Error('无效的模型文件');
    }
    
    // 检查扩展名
    if (!extension || extension.length < 2) {
      throw new Error('无效的文件扩展名');
    }
    
    // 预验证模型数据格式
    if (!isValidModelBuffer(arrayBuffer, extension)) {
      throw new Error('无效的模型文件格式，请确保文件未损坏');
    }
    
    // 创建Blob URL
    let blobUrl;
    try {
      const blob = new Blob([arrayBuffer], { type: 'model/' + extension.substring(1) });
      blobUrl = URL.createObjectURL(blob);
    } catch (blobError) {
      throw new Error('创建Blob URL失败: ' + blobError.message);
    }
    
    // 创建新模型
    const modelEntity = viewer.entities.add({
      name: type === 'before' ? '修复前模型' : '修复后模型',
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      model: {
        uri: blobUrl,
        scale: 1.0,
        minimumPixelSize: 64,
        show: type === 'before',
        // 添加模型加载回调
        readyPromise: undefined // 将在后面设置
      },
      show: type === 'before'
    });
    
    // 设置模型加载完成回调，处理加载失败情况
    const modelPrimitive = modelEntity.model;
    if (modelPrimitive && modelPrimitive.readyPromise) {
      modelPrimitive.readyPromise.then(function(model) {
        console.log(`[${type}] 模型加载成功:`, model);
        // 飞行到模型位置
        setTimeout(() => {
          try {
            if (model.boundingSphere && viewer && viewer.camera) {
              viewer.camera.flyToBoundingSphere(model.boundingSphere, {
                offset: new Cesium.HeadingPitchRange(0, -0.5, 100)
              });
            }
          } catch (e) {
            console.error('飞行到模型位置失败:', e);
          }
        }, 500);
      }).catch(function(error) {
        console.error(`[${type}] 模型加载失败:`, error);
        // 移除失败的模型实体
        try {
          viewer.entities.remove(modelEntity);
        } catch (e) {
          console.error('移除失败模型实体时出错:', e);
        }
        // 添加标记点作为替代
        addFallbackMarker(type);
        updateUploadStatus(type, '模型加载失败: ' + error.message);
      });
    }
    
    // 更新模型引用
    if (type === 'before') {
      beforeModel = modelEntity;
    } else {
      afterModel = modelEntity;
    }
    
    console.log(type === 'before' ? '修复前模型' : '修复后模型' + '实体创建成功');
    
  } catch (error) {
    console.error('模型加载失败:', error);
    updateUploadStatus(type, '模型加载失败: ' + error.message);
    
    // 加载失败时添加标记点作为替代
    addFallbackMarker(type);
  }
}

function loadModelFromBuffers(fileBuffers, type) {
  try {
    if (typeof Cesium === 'undefined' || !viewer) {
      console.error('Cesium 未初始化');
      throw new Error('Cesium 未初始化');
    }
    
    const lng = 104.06;
    const lat = 30.67;
    const height = 1000;
    
    // 移除旧模型
    if (type === 'before' && beforeModel) {
      removeModel(beforeModel);
    } else if (type === 'after' && afterModel) {
      removeModel(afterModel);
    }
    
    // 检查是否有有效的文件
    if (!fileBuffers || fileBuffers.length === 0) {
      throw new Error('没有有效的模型文件');
    }
    
    // 筛选有效的模型文件
    const validBuffers = fileBuffers.filter(f => f.buffer && f.buffer.byteLength > 0);
    if (validBuffers.length === 0) {
      throw new Error('所有文件都是空的');
    }
    
    // 3D Tiles专属格式（必须有tileset.json才能加载）
    const tilesOnlyExtensions = ['.b3dm', '.pnts', '.i3dm', '.cmpt'];
    
    // 检查是否只有3D Tiles专属格式的文件（没有tileset.json时无法加载）
    const hasOnlyTilesFormats = validBuffers.every(f => tilesOnlyExtensions.includes(f.extension));
    if (hasOnlyTilesFormats) {
      throw new Error('检测到3D Tiles格式文件，但缺少tileset.json入口文件');
    }
    
    // 为.osgb格式文件创建3DTiles集
    const osgbBuffers = validBuffers.filter(f => f.extension === '.osgb');
    
    // 排除3D Tiles专属格式，只保留可直接加载的模型格式
    const otherBuffers = validBuffers.filter(f => f.extension !== '.osgb' && !tilesOnlyExtensions.includes(f.extension));
    
    let modelLoaded = false;
    
    // 处理.osgb格式（倾斜摄影模型）
    if (osgbBuffers.length > 0) {
      try {
        // 创建3DTiles tileset
        const combinedBuffer = new Uint8Array(osgbBuffers.reduce((acc, f) => acc + f.buffer.byteLength, 0));
        let offset = 0;
        osgbBuffers.forEach(f => {
          combinedBuffer.set(new Uint8Array(f.buffer), offset);
          offset += f.buffer.byteLength;
        });
        
        const blob = new Blob([combinedBuffer], { type: 'application/octet-stream' });
        const uri = URL.createObjectURL(blob);
        
        // 使用Cesium3DTileset加载倾斜摄影模型
        const tileset = new Cesium.Cesium3DTileset({
          url: uri
        });
        
        // 设置tileset位置
        const position = Cesium.Cartesian3.fromDegrees(lng, lat, height);
        
        tileset.readyPromise.then(() => {
          try {
            viewer.scene.primitives.add(tileset);
            tileset.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, new Cesium.HeadingPitchRoll(0, 0, 0));
            
            // 保存引用
            if (type === 'before') {
              beforeModel = tileset;
            } else {
              afterModel = tileset;
            }
            
            console.log(`${type === 'before' ? '修复前' : '修复后'}3DTiles模型加载成功`);
            
            // 飞行到模型位置
            setTimeout(() => {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lng, lat, height + 500),
                duration: 2.0
              });
            }, 500);
            
          } catch (error) {
            console.error('设置3DTiles模型失败:', error);
          }
        }).catch(error => {
          console.error('3DTiles加载失败:', error);
          // OSGB加载失败，尝试其他格式
          loadOtherModels(otherBuffers, type, lng, lat, height);
        });
        
        modelLoaded = true;
        
      } catch (error) {
        console.error('OSGB模型加载失败:', error);
        // 继续尝试加载其他格式
        loadOtherModels(otherBuffers, type, lng, lat, height);
      }
    }
    
    // 处理其他格式模型
    if (otherBuffers.length > 0 && osgbBuffers.length === 0) {
      loadOtherModels(otherBuffers, type, lng, lat, height);
      modelLoaded = true;
    }
    
    // 如果没有模型加载成功，添加标记点作为替代
    if (!modelLoaded && validBuffers.length > 0) {
      console.warn('没有可用的模型格式，添加标记点');
      addFallbackMarker(type);
    }
    
  } catch (error) {
    console.error('模型加载失败:', error);
    updateUploadStatus(type, '模型加载失败: ' + error.message);
    
    // 加载失败时添加标记点作为替代
    addFallbackMarker(type);
  }
}

function loadOtherModels(buffers, type, lng, lat, height) {
  buffers.forEach((fileBuffer) => {
    try {
      // 检查buffer是否有效
      if (!fileBuffer.buffer || !fileBuffer.buffer.byteLength || fileBuffer.buffer.byteLength === 0) {
        console.warn(`跳过无效文件: ${fileBuffer.name}`);
        return;
      }
      
      // 检查扩展名
      if (!fileBuffer.extension || fileBuffer.extension.length < 2) {
        console.warn(`跳过无效扩展名的文件: ${fileBuffer.name}`);
        return;
      }
      
      // 创建Blob URL
      let blobUrl;
      try {
        const blob = new Blob([fileBuffer.buffer], { type: 'model/' + fileBuffer.extension.substring(1) });
        blobUrl = URL.createObjectURL(blob);
      } catch (blobError) {
        console.error(`创建Blob URL失败: ${fileBuffer.name}`, blobError);
        return;
      }
      
      const modelEntity = viewer.entities.add({
        name: `${type === 'before' ? '修复前' : '修复后'}模型 - ${fileBuffer.name}`,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
        model: {
          uri: blobUrl,
          scale: 1.0,
          minimumPixelSize: 64,
          show: type === 'before'
        },
        show: type === 'before'
      });
      
      // 设置模型加载回调
      const modelPrimitive = modelEntity.model;
      if (modelPrimitive && modelPrimitive.readyPromise) {
        modelPrimitive.readyPromise.then(function(model) {
          console.log(`[${type}] 模型加载成功: ${fileBuffer.name}`);
        }).catch(function(error) {
          console.error(`[${type}] 模型加载失败: ${fileBuffer.name}`, error);
          // 移除失败的模型实体
          try {
            viewer.entities.remove(modelEntity);
          } catch (e) {
            console.error('移除失败模型实体时出错:', e);
          }
        });
      }
      
      // 保存模型引用
      if (type === 'before') {
        beforeModel = modelEntity;
      } else {
        afterModel = modelEntity;
      }
      
      console.log(`${type === 'before' ? '修复前' : '修复后'}模型 ${fileBuffer.name} 实体创建成功`);
      
    } catch (error) {
      console.error(`文件 ${fileBuffer.name} 加载失败:`, error);
    }
  });
}

function addFallbackMarker(type) {
  const lng = 104.06;
  const lat = 30.67;
  const height = 1000;
  
  try {
    const marker = viewer.entities.add({
      name: type === 'before' ? '修复前矿区' : '修复后矿区',
      position: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      point: {
        pixelSize: 10,
        color: type === 'before' ? Cesium.Color.RED : Cesium.Color.GREEN
      },
      label: {
        text: type === 'before' ? '修复前' : '修复后',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15)
      },
      show: type === 'before'
    });
    
    // 更新模型引用
    if (type === 'before') {
      beforeModel = marker;
    } else {
      afterModel = marker;
    }
    
    console.log(`为 ${type === 'before' ? '修复前' : '修复后'} 添加了标记点`);
  } catch (error) {
    console.error('添加标记点失败:', error);
  }
}

// ========== 3D Tiles 模型加载 ==========
function load3DTilesModel(fileBuffers, type) {
  try {
    if (typeof Cesium === 'undefined' || !viewer) {
      console.error('Cesium 未初始化');
      throw new Error('Cesium 未初始化');
    }
    
    const lng = 104.06;
    const lat = 30.67;
    const height = 1000;
    
    // 移除旧模型
    if (type === 'before' && beforeModel) {
      removeModel(beforeModel);
    } else if (type === 'after' && afterModel) {
      removeModel(afterModel);
    }
    
    // 查找 tileset.json 文件
    const tilesetJson = fileBuffers.find(f => f.name.toLowerCase() === 'tileset.json');
    if (!tilesetJson) {
      console.warn('未找到 tileset.json 文件，尝试使用其他方法加载');
      throw new Error('未找到 tileset.json 文件');
    }
    
    // 检查 tileset.json 是否有效
    if (!tilesetJson.buffer || tilesetJson.buffer.byteLength === 0) {
      throw new Error('tileset.json 文件为空');
    }
    
    // 创建内存中的文件系统
    const files = {};
    fileBuffers.forEach(f => {
      // 使用相对路径作为键
      const path = f.fullPath.replace(/^.*[\\\/]/, ''); // 获取文件名
      files[path] = f.buffer;
    });
    
    // 解析 tileset.json
    let jsonString;
    try {
      jsonString = new TextDecoder('utf-8').decode(tilesetJson.buffer);
    } catch (decodeError) {
      throw new Error('tileset.json 解码失败: ' + decodeError.message);
    }
    
    // 检查JSON字符串是否为空
    if (!jsonString || jsonString.trim().length === 0) {
      throw new Error('tileset.json 内容为空');
    }
    
    let tilesetData;
    try {
      tilesetData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON 解析失败，内容预览:', jsonString.substring(0, 200));
      throw new Error('tileset.json 解析失败: ' + parseError.message);
    }
    
    // 创建自定义资源解析器
    const resource = new Cesium.Resource({
      url: 'memory://tileset.json',
      request: function(options) {
        try {
          const url = options.url;
          const path = url.replace('memory://', '');
          
          if (files[path]) {
            return Promise.resolve({
              data: files[path],
              contentType: getContentType(path)
            });
          }
          
          return Promise.reject(new Error(`文件 ${path} 未找到`));
        } catch (error) {
          return Promise.reject(error);
        }
      }
    });
    
    // 加载 3D Tiles
    const tileset = new Cesium.Cesium3DTileset({
      url: resource
    });
    
    // 设置 tileset 位置
    const position = Cesium.Cartesian3.fromDegrees(lng, lat, height);
    
    tileset.readyPromise.then(() => {
      try {
        viewer.scene.primitives.add(tileset);
        
        // 设置模型矩阵，将 tileset 放置在指定位置
        const boundingSphere = tileset.boundingSphere;
        if (boundingSphere && boundingSphere.center) {
          const center = Cesium.Matrix4.getTranslation(boundingSphere.center, new Cesium.Cartesian3());
          const translation = Cesium.Cartesian3.subtract(position, center, new Cesium.Cartesian3());
          const modelMatrix = Cesium.Matrix4.fromTranslation(translation);
          tileset.modelMatrix = modelMatrix;
        }
        
        // 设置显示状态
        tileset.show = type === 'before';
        
        // 保存引用
        if (type === 'before') {
          beforeModel = tileset;
        } else {
          afterModel = tileset;
        }
        
        console.log(`${type === 'before' ? '修复前' : '修复后'}3D Tiles 模型加载成功`);
        
        // 飞行到模型位置
        setTimeout(() => {
          try {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lng, lat, height + 500),
              duration: 2.0
            });
          } catch (flyError) {
            console.error('相机飞行失败:', flyError);
          }
        }, 500);
      } catch (error) {
        console.error('设置 3D Tiles 失败:', error);
        throw error;
      }
    }).catch(error => {
      console.error('3D Tiles 加载失败:', error);
      throw error;
    });
    
  } catch (error) {
    console.error('3D Tiles 模型加载失败:', error);
    updateUploadStatus(type, '3D Tiles 模型加载失败');
    addFallbackMarker(type);
  }
}

function removeModel(model) {
  try {
    if (!model) return;
    
    if (model instanceof Cesium.Cesium3DTileset) {
      viewer.scene.primitives.remove(model);
    } else if (viewer.entities.contains(model)) {
      viewer.entities.remove(model);
    }
  } catch (error) {
    console.error('移除模型失败:', error);
  }
}

function getContentType(path) {
  const extension = path.split('.').pop().toLowerCase();
  const contentTypeMap = {
    'json': 'application/json',
    'b3dm': 'application/octet-stream',
    'pnts': 'application/octet-stream',
    'i3dm': 'application/octet-stream',
    'cmpt': 'application/octet-stream',
    'glb': 'model/gltf-binary',
    'gltf': 'model/gltf+json'
  };
  return contentTypeMap[extension] || 'application/octet-stream';
}

function updateUploadStatus(type, message) {
  const statusElement = document.getElementById(type + 'ModelStatus');
  if (statusElement) {
    statusElement.textContent = message;
  }
}

// ========== 登录功能 ==========
function initLogin() {
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const closeBtn = document.querySelector('.close');
  const loginError = document.getElementById('loginError');
  const app = document.getElementById('app');
  const userName = document.getElementById('userName');
  const btnLogout = document.getElementById('btnLogout');

  // 检查本地存储中的登录状态
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    userName.textContent = user.username;
    loginModal.style.display = 'none';
    app.style.display = 'flex';
    initApp();
    return;
  }

  // 登录表单提交
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    // 简单的登录验证（实际项目中应该调用后端API）
    if (username && password) {
      // 模拟登录成功
      const user = { username: username };
      
      // 记住登录状态
      if (remember) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      
      userName.textContent = username;
      loginModal.style.display = 'none';
      app.style.display = 'flex';
      initApp();
    } else {
      loginError.textContent = '请输入用户名和密码';
    }
  });

  // 关闭登录模态框
  closeBtn.addEventListener('click', function() {
    loginModal.style.display = 'none';
  });

  // 点击模态框外部关闭
  window.addEventListener('click', function(e) {
    if (e.target === loginModal) {
      loginModal.style.display = 'none';
    }
  });

  // 退出登录
  btnLogout.addEventListener('click', function() {
    localStorage.removeItem('user');
    app.style.display = 'none';
    loginModal.style.display = 'flex';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('remember').checked = false;
    loginError.textContent = '';
  });
}

// ========== 启动 ==========
function initApp() {
  try {
    initChart()
    updateInfoPanel()
    initFileUpload() // 初始化文件上传功能
    initSearch() // 初始化搜索功能
    initMapLayerSwitch() // 初始化地图图层切换功能
    
    if (typeof Cesium !== 'undefined') {
      initCesium()
    } else {
      // Cesium 加载失败时的降级处理
      const container = document.getElementById('cesiumContainer')
      if (container) {
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column;">
            <p style="color: #666; margin-bottom: 10px;">地图加载失败</p>
            <p style="color: #999; font-size: 14px;">请检查网络连接后刷新页面</p>
          </div>
        `
      }
      console.warn('Cesium 未加载，使用降级方案')
    }
  } catch (error) {
    console.error('应用初始化失败:', error)
  }
}

// 初始化登录功能
initLogin()