"""Source-linked jurisdiction references and industry process crosswalks.

This is a curated starter index, not a complete legal register or legal opinion.
Every entry points to an official source and carries an explicit scope note.
"""

from __future__ import annotations

from copy import deepcopy

from .industry_templates import INDUSTRIES, MATURITY, TEMPLATES
from .compliance_china_extensions import CHINA_EXTENSIONS
from .compliance_global_extensions import GLOBAL_EXTENSIONS
from .compliance_regional_extensions import REGIONAL_EXTENSIONS

ALL_INDUSTRIES = [
    "food-beverage", "manufacturing", "commerce", "saas", "logistics",
    "construction", "healthcare", "professional-services", "finance-services",
    "property", "education", "agriculture", "energy-utilities", "general-enterprise",
]


def _law(id: str, title: str, authority: str, category: str, summary: str,
         obligations: list[str], process_tags: list[str], source_url: str,
         scope_note: str, effective_date: str | None = None,
         industries: list[str] | None = None, *, country_code: str = "CN",
         country_name: str = "中国", jurisdiction: str | None = None,
         checked_on: str = "2026-09-30", source_kind: str = "法律法规") -> dict:
    return {
        "id": id, "title": title, "authority": authority, "category": category,
        "country_code": country_code, "country_name": country_name,
        "jurisdiction": jurisdiction or f"{country_name}·全国",
        "status": "官方来源索引；适用前核对现行版本", "source_kind": source_kind,
        "effective_date": effective_date, "summary": summary,
        "obligations": obligations, "process_tags": process_tags,
        "industry_keys": industries or ALL_INDUSTRIES, "source_url": source_url,
        "scope_note": scope_note, "checked_on": checked_on,
    }


REGULATIONS = [
    _law("company-law", "中华人民共和国公司法（2023年修订）", "全国人大常委会 / 中国人大网", "公司治理",
         "公司设立、组织机构、股东权利义务、财务会计及治理责任的基础法律。",
         ["把章程、股东会/董事会或执行董事权限落实为可追溯的决策和授权记录。", "公司应依法建立财务会计制度并保存会计账簿、凭证。"],
         ["公司治理", "授权审批", "财务报告", "重大合同"],
         "https://www.npc.gov.cn/npc/c2/c30834/202312/t20231229_433954.html",
         "按公司形态、章程和治理结构核对条款；新修订公司法自2024-07-01施行。", "2024-07-01"),
    _law("work-safety", "中华人民共和国安全生产法（2021年修正）", "应急管理部", "安全生产",
         "适用于生产经营单位安全生产管理的基础法律，强调主体责任、风险管控和隐患治理。",
         ["明确主要负责人及安全管理职责，建立全员安全生产责任制。", "开展风险分级管控、隐患排查治理、教育培训和事故应急管理并留存记录。"],
         ["生产作业", "设备维护", "施工安全", "运输安全", "应急管理"],
         "https://www.mem.gov.cn/fw/flfgbz/fg/202107/t20210716_416558.shtml",
         "具体行业另有消防、道路交通、特种设备、核与辐射等特别规定时，按特别规定及属地要求一并核验。", "2021-09-01"),
    _law("personal-info", "中华人民共和国个人信息保护法", "全国人大常委会 / 国家网信办（全文转载中国人大网）", "数据与隐私",
         "规范个人信息收集、使用、存储、提供、删除及个人权利响应。",
         ["确定处理目的和合法基础，遵循目的明确、最小必要、公开透明。", "对敏感个人信息、委托处理、对外提供及跨境活动进行专项评估和授权核验。", "设置访问控制、保存期限、个人权利请求及事件处置流程。"],
         ["客户资料", "员工人事", "患者信息", "账号权限", "数据导出"],
         "https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm",
         "按个人信息处理者身份、数据类型、处理目的、数据规模及是否跨境评估具体义务；医疗健康等属于敏感个人信息。", "2021-11-01",
         checked_on="2026-10-03"),
    _law("data-security", "中华人民共和国数据安全法", "全国人大常委会 / 国家网信办（全文转载新华社）", "数据与隐私",
         "建立数据分类分级、风险监测、事件处置和重要数据保护等制度。",
         ["建立数据分类分级和全流程数据安全管理制度。", "识别重要数据及相关主管部门要求，开展风险监测、事件响应和责任落实。"],
         ["数据治理", "系统运维", "数据共享", "第三方服务"],
         "https://www.cac.gov.cn/2021-06/11/c_1624994566919140.htm",
         "重点义务取决于数据类别、处理活动及行业主管部门目录和规则；不要仅凭本索引判断是否属于重要数据。", "2021-09-01",
         checked_on="2026-10-03"),
    _law("network-data-security", "网络数据安全管理条例", "司法部国家行政法规库", "数据与隐私",
         "细化网络数据处理者在权限、加密、备份、委托处理和事件处置等方面的要求。",
         ["建立网络数据安全管理制度和访问控制，采取加密、备份等措施。", "对委托处理、数据共享和安全事件建立合同、评估、记录和处置机制。"],
         ["SaaS运维", "个人信息", "数据导出", "供应商管理"],
         "https://xzfg.moj.gov.cn/front/law/detail?LawID=1734",
         "自2025-01-01施行；适用范围与具体条款按主体、数据类型及处理方式核实。", "2025-01-01",
         ["saas", "commerce", "healthcare", "finance-services", "education", "general-enterprise"]),
    _law("consumer-rights-regulation", "消费者权益保护法实施条例", "中国政府网", "消费者权益",
         "细化经营者商品/服务、安全、宣传、格式条款、网络消费和消费者个人信息保护义务。",
         ["确保商品/服务信息、价格和重要限制真实清晰，妥善处理退费、投诉及争议。", "审查促销、自动续费、直播及格式条款，避免误导或不公平安排。"],
         ["商品上架", "定价促销", "订单退款", "客户投诉", "教育收费"],
         "https://app.www.gov.cn/govdata/gov/202403/19/513111/article.html",
         "自2024-07-01施行；按经营者身份、交易渠道、行业特别规则和消费者类型细化适用。", "2024-07-01",
         ["food-beverage", "commerce", "education", "property", "healthcare", "professional-services"]),
    _law("food-safety-regulation", "中华人民共和国食品安全法实施条例", "烟台黄渤海新区管委会法规公开页", "食品安全",
         "食品生产经营主体的食品安全责任、追溯、风险管理及事故处置规则。",
         ["建立食品安全责任和进货查验/过程管理制度。", "记录来源、批次、流向及异常处置，按适用要求开展召回和报告。"],
         ["供应商准入", "食材验收", "批次追溯", "冷链温控", "门店巡检"],
         "https://www.yeda.gov.cn/art/2025/2/10/art_118160_2995325.html",
         "适用食品生产经营主体；经营业态、许可类别和地方规则会影响具体义务。该链接为地方政府法规公开页，落地前应核对国家及属地最新文本。", None,
         ["food-beverage", "manufacturing", "commerce", "agriculture"]),
    _law("food-safety-law", "中华人民共和国食品安全法（2025年修正）", "全国人大常委会公报 / 市场监管总局法规库", "食品安全",
         "食品生产经营、食品安全追溯、餐饮服务及重点食品运输的基础法律；2025年修法新增重点液态食品道路散装运输监管等要求。",
         ["食品生产经营者建立食品安全追溯体系，保证食品可追溯。", "建立食品安全管理制度并落实主体责任；发现事故风险依法采取停止经营、报告和处置措施。", "涉重点液态食品道路散装运输时另行落实许可、容器和运输管理要求。"],
         ["供应商准入", "食材验收", "批次追溯", "冷链温控", "门店巡检", "食品运输"],
         "https://sjfg.samr.gov.cn/law/file/pdf/3238901/1763351546670.pdf",
         "2025年9月修正决定自2025-12-01施行；细化义务及重点液态食品目录/配套规章需对照现行正文和实施规则。", "2025-12-01",
         ["food-beverage", "manufacturing", "commerce", "agriculture"]),
    _law("food-traceability", "食品生产经营企业建立食品安全追溯体系若干规定", "市场监管总局", "食品安全",
         "针对规定范围内食品生产经营企业的追溯记录、顺向追踪和逆向溯源要求。",
         ["按适用范围保留供应商、产品、批次、数量、流向和交易记录，保证记录真实可追溯。", "追溯记录保存期限、电子记录原始版本等按规定具体条款执行。"],
         ["食材验收", "仓储领用", "门店销售", "召回演练"],
         "https://www.samr.gov.cn/zw/zfxxgk/zc/xzgfxwj/art/2023/art_f8b5b891508c495c9aceee58013cb478.html",
         "明确存在适用主体和例外范围；特殊食品、特定行为及不在规定范围内主体应另行核实，不得将该文件扩大解释为所有餐饮企业一律适用。", None,
         ["food-beverage", "manufacturing", "commerce"]),
    _law("food-safety-duty", "食品生产经营企业落实食品安全主体责任监督管理规定", "市场监管总局", "食品安全",
         "食品安全管理人员、风险管控清单及日管控、周排查、月调度机制的监管规则。",
         ["按企业规模和主体类型配备相应食品安全管理人员并明确岗位责任。", "识别食品安全风险、形成检查/排查/调度记录，发现问题落实整改闭环。"],
         ["食品安全组织", "日常巡检", "周度排查", "管理层复盘"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_6892dba109e54ea894aec4340e8f7427.html",
         "根据企业主体类型、规模和现行监管规则判断配置要求；机制名称不应替代现场风险控制。", None,
         ["food-beverage", "manufacturing", "commerce"]),
    _law("restaurant-chain-safety", "餐饮服务连锁企业落实食品安全主体责任监督管理规定", "市场监管总局", "食品安全",
         "针对餐饮服务连锁企业总部、分支机构、中央厨房和门店的食品安全贯通式责任管理。",
         ["连锁总部建立总部月度调度、分支机构周排查、门店日管控等贯通式机制，并落实统一管理责任。", "管理门店准入退出、供应商采购、加工制作、清洁消毒、人员健康、培训考核和食品安全投诉。", "对中央厨房、仓储配送和门店的食品安全工作进行检查评价，按规定向主管部门报告相关情况。"],
         ["总部治理", "门店准入", "采购与配送", "门店加工", "清洁消毒", "食品安全投诉"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_09105249f5984a2fb507e88cd346f20d.html",
         "2025-12-01施行，仅适用于境内餐饮服务连锁经营企业及其总部、分支机构、中央厨房、门店；单店经营者不应据此自动视为连锁企业。", "2025-12-01",
         ["food-beverage"]),
    _law("product-quality", "中华人民共和国产品质量法", "市场监管总局", "产品质量",
         "规范产品质量责任、生产销售行为和监督管理。",
         ["建立原料、生产批次、检验放行和不合格品隔离记录。", "确保产品标识、质量证明和召回/投诉处置与实物批次关联。"],
         ["供应商准入", "生产检验", "产品放行", "售后投诉"],
         "https://www.samr.gov.cn/zfjcj/tzgg/art/2023/art_579118cd202a45fba28b7edfd9f6fd72.html",
         "具体适用应确认产品属性、生产/销售角色和现行修法文本；部分产品还受专项许可或强制标准约束。", None,
         ["manufacturing", "commerce", "food-beverage", "agriculture"]),
    _law("industrial-product-license", "工业产品生产许可证管理条例及实施办法", "市场监管总局", "生产许可",
         "对纳入生产许可目录的工业产品设置许可和生产条件要求。",
         ["确认产品是否在现行生产许可目录，核对许可范围、有效期和生产地址。", "许可、质量体系或关键生产条件变更前完成审批/报告和内部放行校验。"],
         ["产品立项", "生产准入", "质量管理", "许可变更"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_80c40fe0c5e0448783576e7bfbe187d1.html",
         "仅限当前目录内产品及对应生产活动；先对照主管部门现行目录确认，不得按制造业标签推定需要许可证。", None,
         ["manufacturing"]),
    _law("special-equipment", "中华人民共和国特种设备安全法", "市场监管总局", "设备安全",
         "规范特种设备生产、经营、使用、检验、检测和安全监督管理。",
         ["建立特种设备台账、使用登记、定期检验、维护保养及安全管理人员责任。", "检验超期、异常缺陷或安全附件失效时按要求停止/限制使用并闭环处理。"],
         ["设备维护", "电梯运行", "锅炉压力容器", "现场安全"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_ad5e293574484b48b45047ee0ede6099.html",
         "仅适用于法律定义的特种设备及相关活动；设备目录、使用场景和检验要求需结合最新安全技术规范核对。", None,
         ["manufacturing", "property", "construction", "energy-utilities", "food-beverage"]),
    _law("e-commerce-law", "中华人民共和国电子商务法", "中国人大网", "网络交易",
         "规范境内通过互联网销售商品或提供服务的电子商务活动。",
         ["显著公示经营主体、商品/服务、交易步骤和合同履约信息。", "建立交易记录、消费者权益、产品质量、网络安全及个人信息保护控制。"],
         ["商品上架", "订单履约", "平台结算", "退款售后"],
         "https://www.npc.gov.cn/npc/c1773/c1848/c21114/c31834/c31841/201905/t20190521_266893.html",
         "境内电子商务活动适用；金融类产品服务等法定排除情形及平台/经营者不同角色需分别识别。", "2019-01-01",
         ["commerce", "food-beverage", "education", "professional-services"]),
    _law("online-transactions-measures", "网络交易监督管理办法（2025年修改）", "市场监管总局", "网络交易",
         "网络交易经营者、平台经营者的登记、公示、交易信息和平台治理要求。",
         ["识别平台经营者、平台内经营者和自营业务身份并落实差异化义务。", "按规定保存交易信息，审查商品/服务发布及平台内经营者资料，控制订单/投诉处理。"],
         ["商家准入", "商品发布", "交易记录", "投诉退款"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_4b47c79b8d994a42bba4835997688faa.html",
         "2025年修改文本；不同经营角色、交易模式和平台规模对应义务不同，按官方文本和业务身份核验。", None,
         ["commerce", "food-beverage", "education"]),
    _law("cybersecurity-law", "中华人民共和国网络安全法", "全国人大常委会 / 国家网信办法规目录", "网络与系统安全",
         "网络运营安全、等级保护、监测预警、事件处置及网络安全相关治理的基础法律。",
         ["识别网络运营者及系统安全责任，建立网络安全管理制度和技术保护措施。", "对账号权限、系统日志、漏洞、供应链及安全事件保留管理和处置记录。"],
         ["信息系统运维", "账号权限", "软件发布", "安全事件"],
         "https://legalinfo.moj.gov.cn/pub/sfbzhfx/zhfxfzzx/fzzxyw/202510/t20251028_526997.html",
         "2025年修正文本自2026-01-01施行；链接为司法部普法平台修法信息，实施前仍应核对法律现行正文及系统定级要求。", "2026-01-01",
         ["saas", "commerce", "healthcare", "finance-services", "education"]),
    _law("medical-institutions", "医疗机构管理条例", "国家卫生健康委员会", "医疗服务",
         "规范医院、诊所等医疗机构的设置、执业登记、执业活动和监督管理。",
         ["在许可登记的类别、地点和诊疗科目范围内开展执业活动。", "维护执业许可证、人员资质、诊疗科目及变更记录。"],
         ["机构准入", "患者接诊", "诊疗授权", "人员资质"],
         "https://www.nhc.gov.cn/fzs/c100048/202303/79ba042296184726bd100d6fecea177c.shtml",
         "适用于开展疾病诊断、治疗活动的医疗机构；健康管理、互联网服务等边界应结合服务实质和主管部门许可确认。", None,
         ["healthcare"]),
    _law("medical-quality", "医疗质量管理办法", "国家卫生健康委员会", "医疗服务",
         "要求医疗机构建立医疗质量责任、院科两级管理和质量持续改进机制。",
         ["医疗机构主要负责人承担本机构医疗质量管理第一责任，落实院/科责任。", "建立医疗质量管理组织、专门部门、指标/事件管理和持续改进记录。"],
         ["诊疗服务", "医疗质量", "不良事件", "病历管理"],
         "https://www.nhc.gov.cn/wjw/c100221/202201/d2633bf795e443b6a879f27e408539f3.shtml",
         "适用于各级各类医疗机构医疗质量管理；结合机构等级、专科及最新卫生健康规范调整。", "2016-11-01",
         ["healthcare"]),
    _law("medical-records", "医疗机构病历管理规定（2013年版）", "国家卫生健康委员会", "医疗服务",
         "病历书写、归档、保管、复制和封存的业务与记录控制参考。",
         ["设定病历形成、审核、归档、访问和复制流程，限制非授权查阅。", "对病历修改、借阅、封存及复制保留身份、时间和审批轨迹。"],
         ["患者接诊", "病历归档", "信息访问", "患者请求"],
         "https://www.nhc.gov.cn/zwgkzt/glgf/201306/d7bd030b5a2b4f8f88967c73d3e5c0ca.shtml",
         "医疗机构及医疗服务病历范围适用；电子病历和后续规范应同时核实。", None,
         ["healthcare"]),
    _law("road-transport", "中华人民共和国道路运输条例", "司法部国家行政法规库", "道路运输",
         "道路运输经营、车辆、从业人员及客货运输服务的行政法规。",
         ["核对经营许可、经营范围、车辆和从业资格要求。", "将订单、承运人资质、车辆、运输交付和异常记录关联。"],
         ["承运商准入", "运输调度", "车辆管理", "签收结算"],
         "https://xzfg.moj.gov.cn/mobile/law/detail?LawID=1488",
         "仅适用于道路运输经营活动；其他运输方式、特定货物和地方许可另有规则。", None,
         ["logistics"]),
    _law("dangerous-goods-road", "道路危险货物运输管理规定（2026年修正）", "交通运输部", "道路运输",
         "规范道路危险货物运输经营资质、车辆人员、装卸、运单和运输过程安全。",
         ["确认危险货物分类和承运经营许可范围，核验车辆、驾驶员、押运员及设备资质。", "发运前核对装载/运单/车辆标志和安全告知，保存异常和交接记录。"],
         ["危险品分类", "运输订单", "装载检查", "在途异常"],
         "https://xxgk.mot.gov.cn/gz/202602/t20260213_4200295.html",
         "2026年修正；仅在实际承运道路危险货物时适用，按货物目录及特定物品专门规则确认。", None,
         ["logistics", "manufacturing", "energy-utilities"]),
    _law("dangerous-goods-safety", "危险货物道路运输安全管理办法", "市场监管总局 / 多部门规章", "道路运输",
         "对托运人、承运人、装货人的查验记录、培训、运单、车辆和装卸安全提出要求。",
         ["建立货物查验和记录、人员培训、设备管理及岗位操作规程。", "运输前检查车辆设备和定位装置，核对运单、装载与交接。"],
         ["货物申报", "装货核验", "运单管理", "司机培训"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_16efcf6ec1da4d55b0549326880ba531.html",
         "限于使用道路车辆运输列入规则的危险货物及相关活动；豁免和特殊品类另依专门规则处理。", "2020-01-01",
         ["logistics", "manufacturing", "energy-utilities"]),
    _law("construction-quality", "建设工程质量管理条例", "北京市政府法规公开页", "工程建设",
         "规范建设工程质量责任、施工质量控制、竣工验收和质量保修。",
         ["落实建设、勘察、设计、施工和监理等责任主体的质量职责。", "工程变更、材料检验、隐蔽工程、验收及质量问题整改应形成同期记录。"],
         ["项目立项", "设计变更", "工程采购", "施工验收"],
         "https://www.beijing.gov.cn/zhengce/gwywj/202206/t20220617_2744828.html",
         "适用于建设工程质量活动；项目所在地规范、合同条件、资质和工程类别还需核验。", None,
         ["construction"]),
    _law("construction-safety", "建设工程安全生产管理条例", "北京市政府法规公开页", "工程建设",
         "工程建设活动中建设、施工、监理等主体的安全生产管理职责。",
         ["落实安全责任、专项施工方案、风险交底、现场检查及隐患整改。", "对危险性较大工程、特种作业人员和事故应急安排设置前置审批和记录。"],
         ["施工组织", "分包管理", "现场安全", "隐患整改"],
         "https://www.beijing.gov.cn/zhengce/zhengcefagui/qtwj/202307/t20230719_3165890.html",
         "适用于建设工程安全生产；危大工程范围和属地规定需逐项核实。", None,
         ["construction"]),
    _law("cpa-law", "中华人民共和国注册会计师法（2026年修正）", "财政部 / 中国人大网", "专业执业",
         "规范注册会计师执业、会计师事务所和审计服务管理。",
         ["核验执业人员和事务所资格、业务承接、独立性及执业质量管理。", "对业务约定、工作底稿、复核和质量管理保留完整记录。"],
         ["客户准入", "独立性评估", "项目交付", "质量复核"],
         "https://kjs.mof.gov.cn/zhengcefabu/202608/t20260810_3995181.htm",
         "只适用于注册会计师及其事务所法定执业活动；一般财务咨询、管理咨询不能仅因专业服务行业标签套用。", None,
         ["professional-services"]),
    _law("lawyers-law", "中华人民共和国律师法", "国家法律法规数据库", "专业执业",
         "规范律师执业许可、律师事务所、执业权利义务和法律服务纪律。",
         ["核验律师及律师事务所执业资格和业务授权。", "控制客户利益冲突、保密信息访问、委托范围、收费和案件材料归档。"],
         ["客户准入", "利益冲突", "委托合同", "案件档案"],
         "https://flk.npc.gov.cn/detail?fileId=&id=2c909fdd678bf17901678bf867e80a55&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%BE%8B%E5%B8%88%E6%B3%95&type=",
         "只适用于律师及律师事务所执业；其他咨询服务应识别其自身资质、保密和合同义务。", None,
         ["professional-services"]),
    _law("bank-insurance-operational-risk", "银行保险机构操作风险管理办法", "司法部 / 金融监管总局", "金融监管",
         "对银行保险机构操作风险治理、风险识别评估、监测、控制和第三方风险管理提出监管要求。",
         ["建立与机构治理相适配的操作风险管理架构、职责和报告机制。", "识别关键流程、人员、系统和外包风险，形成控制、事件损失数据和整改闭环。"],
         ["客户准入", "支付结算", "授权复核", "外包管理"],
         "https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202409/t20240918_506158.html",
         "仅对该办法规定的持牌银行保险机构及相关活动适用；支付、证券、基金、信托等需查各自监管规章，普通企业不得套用为普遍法定义务。", "2024-07-01",
         ["finance-services"]),
    _law("aml-law", "中华人民共和国反洗钱法（2024年修订）", "全国人大常委会 / 中国人大网", "金融监管",
         "建立反洗钱义务、客户尽职调查、记录保存、可疑交易报告和监督管理框架。",
         ["先识别本企业是否属于法律规定的反洗钱义务主体。", "义务主体建立客户尽调、受益所有人识别、风险分类、记录保存和报告控制。"],
         ["客户准入", "交易监测", "可疑事项报告", "客户资料更新"],
         "https://www.spp.gov.cn/spp/fl/202411/t20241109_671653.shtml",
         "修订法自2025-01-01施行；义务主体范围及金融机构/特定非金融机构具体要求依法律和配套规则确认。", "2025-01-01",
         ["finance-services"]),
    _law("property-management", "物业管理条例", "司法部国家行政法规库", "物业服务",
         "规范业主、业主大会、物业服务企业和物业服务活动。",
         ["合同约定服务范围、收费、公示和投诉处理，建立承接查验和服务记录。", "维修资金、共用设施设备、外包服务及业主共有事项设置授权、验收和对账。"],
         ["物业合同", "收费管理", "设施维护", "投诉处理"],
         "https://xzfg.moj.gov.cn/front/law/detail?LawID=958",
         "具体权利义务还受民法典、地方物业法规、业主共同决定及物业服务合同影响。", None,
         ["property"]),
    _law("private-education", "中华人民共和国民办教育促进法", "中国人大网现行有效法律目录", "教育培训",
         "规范民办学校举办、管理、办学行为和监督管理。",
         ["识别办学主体、办学许可、办学层次和审批范围。", "将招生承诺、收费、师资、课程、资金和教学质量纳入授权及监督机制。"],
         ["招生合同", "学费收取", "课程交付", "退费"],
         "https://www.npc.gov.cn/npc/c2/c30834/202403/t20240301_434977.html",
         "需进入目录后查看对应法律现行文本；办学类型和许可边界依举办主体、学段和服务内容判断。", None,
         ["education"]),
    _law("out-of-school-training-penalty", "校外培训行政处罚暂行办法", "教育部", "教育培训",
         "规范面向中小学生及学龄前儿童校外培训活动的行政处罚。",
         ["核对培训对象、学科/非学科属性、举办主体和办学许可要求。", "招生、课程、收费、从业人员和广告宣传设置合规审核与异常升级。"],
         ["招生宣传", "课程安排", "机构许可", "收费退费"],
         "https://www.moe.gov.cn/srcsite/A02/s5911/moe_621/202309/t20230912_1079788.html",
         "自2023-10-15施行；针对面向中小学生及学龄前儿童的校外培训，不适用于所有教育或职业培训。", "2023-10-15",
         ["education"]),
    _law("training-finance", "校外培训机构财务管理暂行办法", "教育部等部门", "教育培训",
         "对特定校外培训机构收费、预收费、财务管理和资金风险控制提出要求。",
         ["建立收费公示、预收费管理、资金流向监控和退费核对。", "将培训业务流水、合同履行、收费及退款台账定期对账。"],
         ["招生合同", "预收费", "退费结算", "资金管理"],
         "https://www.moe.gov.cn/srcsite/A29/202303/t20230322_1052122.html",
         "仅覆盖文件规定的学龄前及义务教育阶段学科类等校外培训机构范围；文件明确不适用于职业培训，逐类核实。", None,
         ["education"]),
    _law("agri-product-quality", "中华人民共和国农产品质量安全法（2022年修订）", "市场监管总局", "农业生产",
         "规范农产品产地、生产、销售、风险管理和质量安全责任。",
         ["建立农产品生产记录、投入品使用和质量安全追溯。", "遵守农药、兽药、肥料等投入品使用及安全间隔期规定，控制不合格产品销售。"],
         ["种苗采购", "农业投入品", "生产记录", "采收销售"],
         "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_f5a0c2c6c3724a6aad91645043b012ce.html",
         "2022-09-02修订、2023-01-01施行；具体投入品和产品类型另有专项规定时一并遵守。", "2023-01-01",
         ["agriculture"]),
    _law("pesticide-regulation", "农药管理条例", "商务部法规数据库", "农业生产",
         "规范农药登记、生产、经营、使用、包装废弃物处理和监督管理。",
         ["采购/使用农药前核对登记、标签、适用作物和使用范围。", "记录农药购置、领用、施用、用量和安全间隔期并管理包装废弃物。"],
         ["农资准入", "农药使用", "安全间隔期", "生产记录"],
         "https://policy.mofcom.gov.cn/claw/clawContent.shtml?id=94686",
         "根据经营者角色、农药品类及种植作物核对登记标签和禁限用要求；该来源为商务部法规检索页，应与主管部门最新文本交叉核验。", None,
         ["agriculture"]),
    _law("energy-law", "中华人民共和国能源法", "国家能源局 / 全国人大常委会", "能源运营",
         "能源领域基础性法律，涵盖能源规划、开发利用、市场、储备应急与监督管理。",
         ["按能源活动类型识别许可、规划、安全、供应保障、节能和应急管理要求。", "将重大设备、供应中断、能源数据和应急处置纳入治理和报告机制。"],
         ["设备维护", "能源采购", "供能调度", "应急管理"],
         "https://www.nea.gov.cn/2024-12/03/c_1212408329.htm",
         "自2025-01-01施行；煤电油气、新能源、供能公用事业等业务类型适用具体条款不同，行业许可和专项法规另行核对。", "2025-01-01",
         ["energy-utilities"]),
    _law("power-hidden-dangers", "电力重大事故隐患判定标准及治理监督管理规定", "国家发展改革委", "能源运营",
         "规定电力企业重大事故隐患判定、治理、报告和监督管理要求。",
         ["对照电力行业标准建立隐患排查清单、重大隐患报告和治理方案。", "记录整改责任、资金、措施、期限、验收和治理效果，重要隐患按规定报送。"],
         ["电力设备", "运行维护", "隐患治理", "停送电作业"],
         "https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=20619",
         "自2026-07-01施行；主要针对电力企业，不应泛化到所有能源/公用事业公司。", "2026-07-01",
         ["energy-utilities"]),
    _law("accounting-law", "中华人民共和国会计法（2024年修正）", "财政部 / 中国人大网", "财务会计",
         "会计核算、会计监督、会计资料真实性和单位负责人责任的基础法律。",
         ["依实际发生经济业务进行会计核算，保证会计资料真实、完整。", "分离制单、复核、付款和对账等关键岗位，保留审批及会计凭证链。"],
         ["采购付款", "收入确认", "费用报销", "月结对账"],
         "https://kjs.mof.gov.cn/zt/kjfxcgc/kjfqw/202408/t20240814_3941788.htm",
         "按修订文本、单位类型、会计制度及财务报告义务核实具体要求。", None,
         ALL_INDUSTRIES, checked_on="2026-10-03"),
]


# Cross-border reference set. These are official primary-source indexes for
# companies operating in or selling to the listed jurisdictions. They are
# reference points, not a conclusion that a company is subject to every rule.
INTERNATIONAL_REGULATIONS = [
    _law(
        "us-sox-404", "美国SOX §404：SEC财务报告内控评价指引",
        "美国证券交易委员会（SEC）", "财务报告与内控",
        "要求适用的申报公司管理层对财务报告内部控制承担责任并评价其有效性，是上市公司内控测试和缺陷整改的重要参考。",
        ["建立财务报告关键流程、控制目标、责任人和证据目录，按重大账户和披露事项评估控制。", "记录控制缺陷分级、管理层评价、整改和复核结论；自动控制需覆盖变更、权限和完整性。"],
        ["财务报告", "月结对账", "收入确认", "采购付款", "权限管理"],
        "https://www.sec.gov/info/accountants/stafficreporting.htm",
        "链接为SEC 2005年工作人员说明；管理层评价与审计师鉴证应区分，后者另有豁免和分类规则。适用申报公司需核对现行规则，非上市企业可作控制设计参考。",
        None, ALL_INDUSTRIES, country_code="US", country_name="美国", jurisdiction="美国·联邦", checked_on="2026-10-02", source_kind="监管指引",
    ),
    _law(
        "us-fcpa", "美国《反海外腐败法》（FCPA）及 DOJ/SEC 合规指南",
        "美国司法部（DOJ）/ 美国证券交易委员会（SEC）", "反腐败与商业道德",
        "覆盖反商业贿赂和会计记录/内部会计控制要求，并提供跨境经营中合规项目、第三方和调查整改的官方参考。",
        ["对代理商、经销商、顾问和合资伙伴开展基于风险的尽调、审批、培训和持续监测。", "礼品招待、赞助、捐赠、现金/折扣和账务记录保留业务目的、批准和真实入账证据。", "设置举报、调查、补救和高风险交易升级流程，避免用模糊费用科目掩盖付款。"],
        ["第三方准入", "采购付款", "费用报销", "销售佣金", "举报调查"],
        "https://www.justice.gov/criminal/criminal-fraud/fcpa-resource-guide",
        "适用范围取决于主体身份、美国连接点、交易与人员所在地等因素；跨境业务应由当地律师核验，不把指南当作自动适用结论。",
        None, ALL_INDUSTRIES, country_code="US", country_name="美国", jurisdiction="美国·联邦", checked_on="2026-10-02", source_kind="监管指引",
    ),
    _law(
        "eu-gdpr", "欧盟《通用数据保护条例》（GDPR）",
        "欧盟 EUR-Lex / European Union", "数据与隐私",
        "规范个人数据处理、数据主体权利、处理者责任、跨境传输和数据泄露响应，是面向欧盟客户或人员的数据流程参考。",
        ["建立处理活动记录、目的/法律基础、最小化、保存期限和数据主体请求响应流程。", "对委托处理、跨境传输、敏感数据和高风险处理进行合同、评估和安全控制。", "制定数据泄露识别、评估、通知和证据留存路径，并定期复核供应商与权限。"],
        ["客户资料", "员工人事", "营销授权", "供应商管理", "数据导出", "安全事件"],
        "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679",
        "适用于条例规定范围内的欧盟境内处理活动及部分面向欧盟个人的境外主体；具体地域和处理者/控制者角色需逐案判断。",
        "2018-05-25", ALL_INDUSTRIES, country_code="EU", country_name="欧盟", jurisdiction="欧盟·跨境", checked_on="2026-10-02",
    ),
    _law(
        "uk-bribery", "英国《反贿赂法 2010》（Bribery Act 2010）",
        "英国政府 / legislation.gov.uk", "反腐败与商业道德",
        "覆盖行贿、受贿、贿赂外国公职人员及商业组织未防止贿赂等风险，适合跨境销售、代理和采购流程参考。",
        ["按风险建立比例适当的反贿赂政策、管理层承诺、尽调、培训、礼品招待和举报渠道。", "对代理商、分销商、顾问、联合项目和高风险市场保留审批、付款和持续监督证据。", "把异常付款、第三方佣金和账务分类纳入调查、整改和管理层复核。"],
        ["第三方准入", "销售佣金", "采购付款", "礼品招待", "举报调查"],
        "https://www.legislation.gov.uk/ukpga/2010/23/contents/enacted",
        "适用范围与英国主体、英国业务连接点及商业组织活动有关；官方指引强调按风险和规模设计控制，需结合业务事实确认。",
        "2011-07-01", ALL_INDUSTRIES, country_code="GB", country_name="英国", jurisdiction="英国·全国", checked_on="2026-10-02",
    ),
    _law(
        "jp-appi", "日本《个人信息保护法》（APPI）",
        "日本个人信息保护委员会（PPC）", "数据与隐私",
        "规范日本个人信息处理、第三方提供、安全管理和跨境提供，是在日本开展员工、客户或会员数据业务的参考。",
        ["明确利用目的、通知/公开、访问权限、委托处理和个人请求处理责任。", "对安全管理、泄露报告、第三方提供和跨境传输保留评估、同意/告知和记录。"],
        ["客户资料", "员工人事", "会员营销", "供应商管理", "数据导出"],
        "https://www.ppc.go.jp/en/legal/",
        "日本官方英文译文仅供参考，日文原文具有法律效力；是否适用需按日本境内处理、提供和主体角色核验。",
        None, ALL_INDUSTRIES, country_code="JP", country_name="日本", jurisdiction="日本·全国", checked_on="2026-10-02",
    ),
    _law(
        "sg-pdpa", "新加坡《个人数据保护法》（PDPA）",
        "新加坡总检察署（AGC）/ Singapore Statutes Online", "数据与隐私",
        "建立个人数据收集、使用、披露、保护、保留和数据泄露通报的企业控制参考。",
        ["将目的、通知/同意、访问更正、保留期限和供应商处理职责落入数据流程。", "建立合理安全措施、泄露评估和通知、跨境传输及责任人机制。"],
        ["客户资料", "员工人事", "营销授权", "数据导出", "安全事件"],
        "https://sso.agc.gov.sg/Act/PDPA2012/",
        "适用范围取决于组织、处理活动和新加坡连接点；官方指南及行业规则可能补充具体要求。",
        None, ALL_INDUSTRIES, country_code="SG", country_name="新加坡", jurisdiction="新加坡·全国", checked_on="2026-10-03",
    ),
    _law(
        "au-privacy", "澳大利亚《隐私法 1988》（Privacy Act 1988）",
        "澳大利亚信息专员办公室（OAIC）", "数据与隐私",
        "规范澳大利亚政府机构及达到适用门槛的组织处理个人信息，是澳大利亚客户、员工和供应商数据流程的参考。",
        ["建立隐私政策、收集目的、访问更正、直接营销、跨境披露和数据保留控制。", "对信息安全、数据泄露响应和第三方/境外服务商责任进行记录和定期复核。"],
        ["客户资料", "员工人事", "营销授权", "供应商管理", "安全事件"],
        "https://www.oaic.gov.au/privacy/privacy-legislation/the-privacy-act",
        "覆盖范围、营业额门槛和豁免事项需依据澳大利亚现行法逐案判断；州/领地规则可能另外适用。",
        None, ALL_INDUSTRIES, country_code="AU", country_name="澳大利亚", jurisdiction="澳大利亚·联邦", checked_on="2026-10-02", source_kind="监管指引",
    ),
    _law(
        "us-ccpa", "美国加州CCPA/CPRA：消费者隐私权官方说明",
        "加州司法部 / Office of the Attorney General", "消费者与数据",
        "为面向加州消费者的企业提供个人信息告知、访问/删除/更正、退出出售或共享等流程控制参考。",
        ["建立隐私告知、消费者请求验证、访问/删除/更正和响应时限的工单流程。", "识别出售/共享、定向广告、服务商/承包商角色及敏感个人信息，保存选择退出和审计记录。"],
        ["商品上架", "客户资料", "会员营销", "数据导出", "客户请求"],
        "https://www.oag.ca.gov/privacy/ccpa",
        "官方FAQ并非法律意见。适用取决于营利主体、加州业务、门槛和角色；CPRA修改CCPA，新增权利自2023年起适用。门槛及现行实施规则需另核对。",
        None, ALL_INDUSTRIES, country_code="US", country_name="美国", jurisdiction="美国·加州", checked_on="2026-10-02", source_kind="官方说明",
    ),
]

REGULATIONS.extend(INTERNATIONAL_REGULATIONS)
REGULATIONS.extend(CHINA_EXTENSIONS)
REGULATIONS.extend(GLOBAL_EXTENSIONS)
REGULATIONS.extend(REGIONAL_EXTENSIONS)


# Three end-to-end workflow crosswalks per industry. The underlying workflow,
# risk, control, test, population and evidence fields are taken from the
# existing systematized industry playbook; this layer adds legal relevance.
PROCESS_GUIDANCE = {
    "food-beverage": [
        {"law_ids": ["food-safety-law", "food-safety-regulation", "food-traceability", "food-safety-duty"], "focus": "供应商资质、采购批次、到货验收和不合格原料隔离。", "risk_prompt": "核实经营主体是否有适用许可，资质与收款账户是否有效；异常批次能否在投入门店前阻断。", "checkpoints": ["供应商/产品许可及有效期是否在准入和定期复核时核验。", "收货数量、批次、日期、包装、效期及适用温度是否与订单和凭证一致。", "退货、拒收、隔离、召回及供应商变更是否有批准和批次去向记录。"]},
        {"law_ids": ["food-safety-law", "food-safety-regulation", "food-traceability", "food-safety-duty", "restaurant-chain-safety"], "focus": "门店加工卫生、冷藏冷冻、开封效期、清洁和食品安全异常处理。", "risk_prompt": "茶饮门店重点检查鲜奶/茶底/冰块、制冰设备、交叉污染、开封时限和跨店调拨记录；若为连锁经营，重点核对总部到门店的责任穿透。", "checkpoints": ["根据本经营形态维护日常风险清单和岗位责任，检查实测值而非只勾选。", "温控超限、过期或卫生异常产品先隔离，记录影响批次、数量、决定人与复核人。", "连锁企业总部/分支/门店职责、培训、统一采购及巡查评价有对应负责人和记录。", "异常上报、投诉、疑似事故和召回评估有时限、升级路径和处置证据。"]},
        {"law_ids": ["consumer-rights-regulation", "e-commerce-law", "personal-info"], "focus": "门店/线上价格与促销、退款投诉、会员信息及销售批次追踪。", "risk_prompt": "促销宣传或会员营销可能引发价格争议；收银退款权限和顾客个人信息访问也需分权。", "checkpoints": ["价格、促销规则、适用门店/渠道、起止时间和消费者限制经审批并可核验。", "POS、支付渠道、退款、优惠券及日结金额及时对账，异常由非经办人复核。", "会员信息采集和营销授权有明确目的、最小字段、退订/删除和供应商处理约束。"]},
    ],
    "manufacturing": [
        {"law_ids": ["company-law", "work-safety", "industrial-product-license"], "focus": "供应商准入、采购授权、目录许可和关键原材料验收。", "risk_prompt": "确认产品是否属于生产许可目录或受强制认证/特殊行业准入；采购不得绕过合格供应商和审批。", "checkpoints": ["采购需求、比价/单一来源理由、授权金额、供应商关联关系和合同条款完整。", "供应商主数据、银行账户变更由独立人员验证，订单与收货验收分岗。", "对需许可/认证产品建立许可证、范围、地址和有效期台账。"]},
        {"law_ids": ["work-safety", "special-equipment", "product-quality"], "focus": "生产工单、领料、工艺变更、关键设备和安全作业。", "risk_prompt": "未批准工艺/设备变化、无证设备或维护延期可能同时造成质量与人身安全事故。", "checkpoints": ["工单、BOM/工艺版本、领料、报工和完工入库相互勾稽。", "设备检验、维护、操作资质和安全联锁按目录/设备要求验证。", "危险作业审批、能源隔离、承包商交底及异常停机复位均保留同期记录。"]},
        {"law_ids": ["product-quality", "industrial-product-license", "special-equipment"], "focus": "检验放行、不合格品、产品追溯和召回。", "risk_prompt": "质量偏差若无法锁定批次、放行人员和客户流向，会扩大召回和损失范围。", "checkpoints": ["检验标准、设备校准、原始结果、判定/让步权限与成品放行人员可追溯。", "不合格品在系统和现场同步锁定，返工/报废/让步审批与复检关联。", "抽查从成品向原料及客户双向追溯，确认投诉和召回能定位受影响范围。"]},
    ],
    "commerce": [
        {"law_ids": ["e-commerce-law", "online-transactions-measures", "consumer-rights-regulation"], "focus": "商家/商品准入、价格促销和商品信息发布。", "risk_prompt": "平台、自营店和平台内商家身份混淆；商品信息、定价和促销配置失真可能导致消费者争议。", "checkpoints": ["识别交易主体和平台角色，核验主体信息、许可及商品必要资质。", "价格/促销申请、审批、发布、前台复核和有效期关闭分离并保留日志。", "商品描述、限制条件、服务承诺和价格表达在各渠道一致且能重演。"]},
        {"law_ids": ["e-commerce-law", "consumer-rights-regulation", "personal-info"], "focus": "订单履约、退换货、退款、补偿和消费者投诉。", "risk_prompt": "虚假签收、重复退款、格式条款不清或客服越权补偿会带来损失及投诉风险。", "checkpoints": ["订单、支付、物流/交付、退货理由、退款流水和库存回仓相互核对。", "高额/重复/无退货退款、人工补偿及例外审批生成完整异常清单。", "消费者请求、投诉及个人信息访问有处理时限、权限限制和升级留痕。"]},
        {"law_ids": ["online-transactions-measures", "accounting-law", "product-quality"], "focus": "渠道结算、平台扣费、库存盘点和商品质量退货。", "risk_prompt": "平台对账差异、库存调整和退货原因若割裂，会掩盖短款、损耗或质量缺陷。", "checkpoints": ["订单、平台账单、手续费、支付到账和银行流水按结算周期核对。", "盘点人、差异调查人和调整审批人适当分离，重大差异追溯交易。", "高频质量投诉/退货形成趋势分析，并反馈至供应商和停售/召回决策。"]},
    ],
    "saas": [
        {"law_ids": ["cybersecurity-law", "network-data-security", "personal-info"], "focus": "人员/服务账号生命周期、特权访问和客户数据访问。", "risk_prompt": "离职/调岗权限未收回、共享账号和超范围客户数据访问，可能导致数据泄露且无法追责。", "checkpoints": ["入转调离事件与 IAM/云控制台账号完整性对账，特权账号实名、强认证和限时授权。", "季度复核生产、敏感数据、供应商和紧急账号；异常导出可关联人员、工单与审批。", "最小化客户数据处理字段，记录委托处理、租户隔离和个人信息请求响应。"]},
        {"law_ids": ["cybersecurity-law", "data-security", "network-data-security"], "focus": "研发变更、构建发布、漏洞处置和供应链组件。", "risk_prompt": "开发人员自行批准并发布、紧急变更不复核或漏洞未分级会使生产环境和客户服务暴露。", "checkpoints": ["变更单含业务理由、评审、测试、审批、回滚方案和实施日志。", "紧急变更在事后由独立人员复核并追踪遗留风险；依赖组件和漏洞有责任人与期限。", "配置/安全策略修改、日志删除和审计功能关闭设置额外审批及告警。"]},
        {"law_ids": ["data-security", "network-data-security", "personal-info"], "focus": "客户数据分类、备份恢复、事件响应和第三方处理。", "risk_prompt": "备份任务成功并不等于可恢复；数据出境、委托处理和事件通报判断缺位会产生合规风险。", "checkpoints": ["分类清单标明数据责任人、位置、用途、敏感级别、保存期限和共享对象。", "抽样执行隔离环境恢复，记录恢复时间、完整性、差异和整改；监控备份失败。", "委托合同约定处理边界和安全责任，事件演练包含影响评估、遏制、通知判断和复盘。"]},
    ],
    "logistics": [
        {"law_ids": ["road-transport", "dangerous-goods-road", "dangerous-goods-safety"], "focus": "承运商、车辆、司机和货物属性的准入核验。", "risk_prompt": "运输方式/货物类别不匹配、资质过期或超经营范围承运会造成停运和安全事故。", "checkpoints": ["按普通货物/道路危险货物等分类识别适用许可，系统在派单前校验有效期及范围。", "供应商和驾驶人员变更独立复核，保存准入、保险、车辆检验和培训证据。", "合同明确交接、时效、温控、异常上报、货损责任和分包限制。"]},
        {"law_ids": ["road-transport", "dangerous-goods-safety", "work-safety"], "focus": "订单调度、装车核验、在途监控和交付签收。", "risk_prompt": "危险货物、冷链货物或高价值货物的装载、路线和温控异常必须匹配货物特性。", "checkpoints": ["派单、装货清单、车辆/司机、货物标识和随车单证相互匹配。", "适用时记录起运检查、温度/定位、在途异常和安全告知，超限有停运/升级决定。", "电子签收应关联收货人身份、时间地点、数量差异和影像凭证，异常不得直接结算。"]},
        {"law_ids": ["accounting-law", "road-transport", "dangerous-goods-safety"], "focus": "运费结算、索赔、货损和承运商绩效。", "risk_prompt": "假签收、重复结算、运价绕批或货损赔付缺乏根因会造成成本和舞弊风险。", "checkpoints": ["运输订单、合同费率、计费里程/重量、签收证明和发票进行三方/多方核对。", "货损、延误、温控和安全事件与赔付、保险理赔及供应商扣款关联。", "异常运价、手工调账和重复付款由独立复核人抽查并形成处置结果。"]},
    ],
    "construction": [
        {"law_ids": ["construction-quality", "construction-safety", "company-law"], "focus": "项目立项、预算测算、招采与合同授权。", "risk_prompt": "未批先建、预算依据不完整、关联承包商未披露或合同拆分会造成成本超支和治理失效。", "checkpoints": ["项目可研、预算来源、投资决策、授权层级与项目代码一一对应。", "招标/比选过程、投标人资格、评审记录、利益冲突声明和中标审批留痕。", "合同范围、工期、计价、付款节点、保函、质量安全责任与授权矩阵核对。"]},
        {"law_ids": ["construction-quality", "construction-safety", "work-safety"], "focus": "施工分包、工程变更、现场安全和工程计量。", "risk_prompt": "先施工后签证、分包越界、危险作业方案缺失或现场验收由同一人完成会扩大损失。", "checkpoints": ["分包资质、人员资格、进场交底和合同范围在现场开工前核验。", "设计/现场变更有技术论证、预算影响、授权审批和版本变更后才实施。", "现场巡检、隐患整改、危大工程方案、材料检测与工程量签认可相互印证。"]},
        {"law_ids": ["construction-quality", "construction-safety", "accounting-law"], "focus": "工程验收、付款结算、保修和竣工档案。", "risk_prompt": "无验收支付、虚增工程量、缺陷保修遗漏或未移交资料会导致资金流失和后续责任争议。", "checkpoints": ["付款申请与合同节点、工程量复核、质量验收、发票及保留金相匹配。", "竣工验收、专项验收、材料合格证明和变更竣工图归档完整。", "保修缺陷登记、责任单位、响应时限、维修复验和费用扣回有闭环。"]},
    ],
    "healthcare": [
        {"law_ids": ["medical-institutions", "personal-info", "network-data-security"], "focus": "机构/科目许可、患者登记和敏感健康信息采集。", "risk_prompt": "服务项目、地点、人员资格超出执业许可范围，或患者敏感信息过度收集。", "checkpoints": ["证照、诊疗科目、执业地点及医护人员资质在接诊前核验并设到期提醒。", "登记信息按诊疗目的最小化，健康/身份等敏感字段有必要性、授权和严格访问控制。", "外部检验/云服务/预约服务商受托处理范围和数据安全责任经审查。"]},
        {"law_ids": ["medical-quality", "medical-records", "medical-institutions"], "focus": "诊疗授权、病历记录、质量事件和不良事件报告。", "risk_prompt": "病历迟记/修改无轨迹、关键诊疗流程偏离或质量事件未上报会影响患者安全和证据可信度。", "checkpoints": ["医嘱、执行、复核、关键时间点和责任人员记录可按患者/事件完整重建。", "病历补记、更正、封存、借阅和复制保留操作人、时间、原因和审批轨迹。", "不良事件/近失事件有分级、上报、根因分析、改进措施及复测记录。"]},
        {"law_ids": ["personal-info", "medical-records", "network-data-security"], "focus": "病历访问、数据导出、保存归档和患者权利请求。", "risk_prompt": "非诊疗人员访问、批量导出和患者请求超时处理可能泄露敏感健康信息。", "checkpoints": ["按岗位最小授权，定期复核病历访问及批量查询日志，调查非工作时间/异常访问。", "导出需明确用途、字段、范围、批准人及接收方，文件传输和留存受控。", "保留和销毁期限按适用规则/病历类型确认，患者复制、更正等请求留痕办理。"]},
    ],
    "professional-services": [
        {"law_ids": ["cpa-law", "lawyers-law", "company-law"], "focus": "客户准入、执业资格、利益冲突及服务承接。", "risk_prompt": "只有在提供受监管执业服务时适用会计师/律师专项法律；冲突检索不完整会伤害客户和独立性。", "checkpoints": ["记录服务类型、交付对象、承诺范围及是否触发执业许可/签字资格。", "签约前完成客户身份、制裁/声誉、利益冲突和独立性检索；冲突豁免须有权批准。", "客户资料保密、访问权限、受托处理和团队成员保密承诺在立项时确认。"]},
        {"law_ids": ["cpa-law", "lawyers-law", "personal-info"], "focus": "委托合同、项目计划、专业判断和关键交付复核。", "risk_prompt": "服务范围外承诺、利益相关人员自我复核或未经批准使用客户数据会造成执业和合同风险。", "checkpoints": ["委托书清楚界定范围、责任、收费、前提条件、交付物、保密及终止安排。", "关键工作底稿、证据来源、专业判断、复核意见和版本修改可重演。", "客户资料访问按项目和保密级别授权；外发交付经过质量与授权复核。"]},
        {"law_ids": ["accounting-law", "company-law", "personal-info"], "focus": "工时/费用、开票回款、档案保留和客户资料销毁。", "risk_prompt": "项目成本漏记、分包/专家费用未披露、逾期应收或客户资料超期留存。", "checkpoints": ["工时、差旅、专家采购与项目预算/合同核对，异常超支经独立审批。", "交付验收、开票、收入确认和回款按合同条款核对并跟踪逾期。", "档案保留、法律保全、客户归还/删除请求和销毁证明分别留痕。"]},
    ],
    "finance-services": [
        {"law_ids": ["bank-insurance-operational-risk", "aml-law", "personal-info"], "focus": "先判定是否为持牌金融机构及具体产品/服务边界，再设计客户准入。", "risk_prompt": "金融监管规则通常只对特定持牌主体生效；误把一般咨询公司当银行/保险义务主体同样会导致错误配置。", "checkpoints": ["记录牌照/许可、监管对象、产品、渠道和地域，明确责任合规人员。", "识别反洗钱义务主体范围；如适用，客户尽调、受益所有人、风险等级和资料更新设前置校验。", "客户金融账户等敏感个人信息处理建立单独权限、最小化和安全传输措施。"]},
        {"law_ids": ["bank-insurance-operational-risk", "aml-law", "accounting-law"], "focus": "交易处理、资金划转、复核和异常监测。", "risk_prompt": "人工覆盖、重复支付、未授权交易或可疑交易漏报可构成重大运营与监管风险。", "checkpoints": ["交易发起、复核、授权、记账和对账岗位分离；系统权限与授权矩阵一致。", "高风险/异常交易阈值、人工覆盖、重复指令和失败重试进入监控队列。", "若属反洗钱义务主体，按适用规章保存调查、报告和保密记录。"]},
        {"law_ids": ["bank-insurance-operational-risk", "data-security", "network-data-security"], "focus": "外包服务、系统中断、操作损失事件和监管报送。", "risk_prompt": "第三方集中度、服务中断、操作损失和数据泄漏的升级处置不清会影响关键业务持续性。", "checkpoints": ["重要外包先做风险评估，合同约定审计权、数据责任、分包限制、退出与连续性。", "记录差错/欺诈/中断/损失事件和根因，定义升级、报告、整改责任及验证。", "开展系统与业务连续性演练，记录实际恢复效果、客户影响和遗留整改。"]},
    ],
    "property": [
        {"law_ids": ["property-management", "company-law", "consumer-rights-regulation"], "focus": "物业服务合同、招投标/续聘、承接查验和服务边界。", "risk_prompt": "服务范围、收费标准和共有区域责任不清，会引发业主争议与履约责任。", "checkpoints": ["合同、服务标准、收费方案和业主/业委会授权决议互相匹配。", "承接查验、钥匙/设施设备移交、缺陷清单和整改责任双方签认。", "外包保洁、安保、维修单位资质、合同范围、履约和人员进场记录完整。"]},
        {"law_ids": ["property-management", "special-equipment", "work-safety"], "focus": "电梯、消防、供配电等共用设施维护与安全隐患闭环。", "risk_prompt": "电梯检验过期、设施缺陷、消防通道阻塞或维保记录造假可能直接危害人身安全。", "checkpoints": ["设备台账覆盖使用登记、检验到期、维保单位和故障/停运状态。", "巡检缺陷记录风险等级、临时防护、责任人与复验，不因外包而免除管理监督。", "适用时核验特种设备检验、安全管理人员、应急演练和监管报告凭证。"]},
        {"law_ids": ["property-management", "accounting-law", "consumer-rights-regulation"], "focus": "物业费、公共收益、维修资金和投诉处理。", "risk_prompt": "收费账款与服务台账脱节、公共收益或维修资金未经授权使用。", "checkpoints": ["收费、减免、押金、催收和退款权限明确，账单与银行到账/合同租户核对。", "公共收益及专项资金设独立台账、用途审批、定期对账和依法公示。", "投诉工单分类、处理期限、责任部门、费用补偿和重复问题趋势可追踪。"]},
    ],
    "education": [
        {"law_ids": ["private-education", "out-of-school-training-penalty", "consumer-rights-regulation"], "focus": "办学资质、招生宣传、合同承诺和课程安排。", "risk_prompt": "培训对象/学段与许可类型不匹配、夸大宣传或课程交付变更未经告知。", "checkpoints": ["按学段、办学主体和培训内容确认许可、备案及可招生范围。", "广告、师资、课程结果承诺经审核，与合同、实际排课和退款规则一致。", "学员未成年人信息有监护人告知/授权、访问控制和保存期限。"]},
        {"law_ids": ["training-finance", "private-education", "consumer-rights-regulation"], "focus": "学费/预收费、合同履约、退费与资金管理。", "risk_prompt": "预收费余额与未消课义务不匹配，退费计算和教学服务完成凭证不可靠。", "checkpoints": ["收费项目、金额、期间、预收费管理方式、发票和合同一致。", "将学员课时/消课、收入确认、退款申请、支付流水和账户余额定期勾稽。", "按适用范围监控预收费资金、建立余额异常和停业/退费预案。"]},
        {"law_ids": ["out-of-school-training-penalty", "personal-info", "work-safety"], "focus": "教师资质、教学交付、未成年人保护和场地安全。", "risk_prompt": "无资质人员授课、师生边界不当、学生信息泄露或消防安全疏漏。", "checkpoints": ["教师和外聘人员资格、背景核验、培训和课程安排经授权。", "投诉/安全事件有保护学生、及时升级、调查、家长沟通和整改复测流程。", "场地消防、疏散、设备维护、出勤点名和突发事件演练保留证据。"]},
    ],
    "agriculture": [
        {"law_ids": ["agri-product-quality", "pesticide-regulation", "product-quality"], "focus": "种苗、饲料、农药、兽药、肥料供应商与投入品验收。", "risk_prompt": "禁限用或来源不明投入品、标签不符和采购记录缺失会污染生产并破坏溯源。", "checkpoints": ["供应商许可/登记和产品标签、批次、有效期及适用作物/动物核验。", "入库批次与采购、领用、库存盘点对账，过期/禁限用产品隔离。", "投入品异常、退货、监管公告和供应商变更有复核及追责记录。"]},
        {"law_ids": ["agri-product-quality", "pesticide-regulation", "food-safety-regulation"], "focus": "田间/养殖生产记录、用药用肥、采收和安全间隔期。", "risk_prompt": "施用对象、剂量、日期和安全间隔期未关联地块/批次，导致不合格产品进入采收。", "checkpoints": ["记录地块/圈舍、投入品名称、登记用途、施用人、剂量、日期和气象条件。", "系统/台账根据产品和作物校验安全间隔期及采收日期，例外产品先行隔离。", "设备清洗、农药包装废弃物、兽药休药期和相关培训按适用规则留痕。"]},
        {"law_ids": ["agri-product-quality", "food-traceability", "product-quality"], "focus": "采收分级、检测、批次追溯、销售与召回。", "risk_prompt": "批次混装、检测未放行、来源/去向记录断点会扩大食品安全风险。", "checkpoints": ["采收批次关联地块/生产记录、检测结果、分级包装和仓储位置。", "出库、销售、客户、运输和退货记录可双向追踪，批次变更有授权。", "抽测不合格时有停售/隔离/通知/召回范围评估和复盘证据。"]},
    ],
    "energy-utilities": [
        {"law_ids": ["energy-law", "work-safety", "special-equipment"], "focus": "能源项目/采购、运行调度和关键设备许可检验。", "risk_prompt": "不同能源业态的许可、供能责任和设备安全要求不同，需先划清业务边界。", "checkpoints": ["按电力、燃气、热力、油气、新能源等业务识别许可、并网/调度和行业规则。", "关键设备台账关联检验、维护周期、异常工单、备件和停运审批。", "采购/交易、计量、结算和调度数据保留授权版本与独立核对。"]},
        {"law_ids": ["energy-law", "power-hidden-dangers", "work-safety"], "focus": "设备缺陷/重大隐患排查、检修、操作许可和治理验收。", "risk_prompt": "高危缺陷被降级、整改超期、无票作业或设备带缺陷运行会导致重大事故和供能中断。", "checkpoints": ["按业态适用标准筛查隐患并由授权安全/技术人员分级，不得为压降指标随意降级。", "工作票、操作票、隔离措施、承包商资格和现场复核在检修前后闭环。", "重大隐患治理记录责任、资金、方案、期限、停运措施及验收；适用时依法报告。"]},
        {"law_ids": ["energy-law", "network-data-security", "data-security"], "focus": "供能服务连续性、应急响应、客户计量和能源数据。", "risk_prompt": "关键基础设施/重要数据判定、调度网络安全和供应中断通知可能触发专门义务。", "checkpoints": ["开展中断、极端天气、设备故障和网络攻击情景演练，验证备用资源与恢复步骤。", "客户计量、结算和工单调整可追溯至表计、规则版本、现场记录和批准。", "识别能源数据分类、关键系统边界、第三方接入和事件上报责任人。"]},
    ],
    "general-enterprise": [
        {"law_ids": ["company-law", "accounting-law", "consumer-rights-regulation"], "focus": "合同、客户准入、授权签署和订单履约。", "risk_prompt": "合同承诺超授权、履约验收与收入确认脱节或关联方未识别。", "checkpoints": ["客户、合同主体、价格折扣、授权签署和例外条款符合审批矩阵。", "订单、交付/验收、发票、收入和回款按期间对账并追查差异。", "合同变更、关联方交易和争议事项单独标记、升级并保留版本。"]},
        {"law_ids": ["company-law", "work-safety", "data-security"], "focus": "采购、供应商主数据、验收和付款审批。", "risk_prompt": "虚假供应商、账户篡改、重复付款、未验收先付款或供应安全问题。", "checkpoints": ["供应商尽调、关联关系声明、资质/账户独立验证和主数据变更日志完整。", "采购申请、比价/豁免审批、合同、收货/服务验收、发票和付款闭环匹配。", "异常价格、拆单、紧急采购、重复发票和银行账户变更生成复核清单。"]},
        {"law_ids": ["accounting-law", "company-law", "personal-info"], "focus": "月结、费用、会计分录和经营数据权限。", "risk_prompt": "手工分录未经复核、账户对账滞后、费用凭证不实或员工/客户数据暴露。", "checkpoints": ["月结清单明确责任人/期限，重要账户由非记账人员独立对账。", "手工分录、估计、费用及期后调整保留业务依据、审批和复核。", "财务、人事及客户数据按岗位最小授权，导出和共享有目的及留痕。"]},
    ],
}


PROCESS_CHECK_CODE_ORDER = {
    "food-beverage": {"SUP": 0, "SAFE": 1, "POS": 2},
    "manufacturing": {"PUR": 0, "INV": 1, "QLT": 2},
    "commerce": {"SKU": 0, "ORD": 1, "SET": 2},
    "saas": {"IAM": 0, "CHG": 1, "REC": 2},
    "logistics": {"DSP": 1, "FRT": 2},
    "construction": {"PRJ": 0, "SUB": 1},
    "healthcare": {"PRV": 2},
    "professional-services": {"CLI": 0, "DEL": 1, "REV": 2},
    "finance-services": {"KYC": 0, "TXN": 1},
    "property": {"LEASE": 0, "MNT": 1, "FEE": 2},
    "education": {"ENR": 0, "CLS": 2},
    "agriculture": {"INPUT": 0, "GROW": 1, "HARV": 2},
    "energy-utilities": {"MRO": 1, "SPARE": 0},
    "general-enterprise": {"SALE": 0, "AP": 1, "CLOSE": 2},
}


JURISDICTIONS = [
    {"code": "CN", "name": "中国大陆", "group": "CHINA"},
    {"code": "HK", "name": "香港特别行政区", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "MO", "name": "澳门特别行政区", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "TW", "name": "台湾地区", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "US", "name": "美国", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "EU", "name": "欧盟", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "GB", "name": "英国", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "JP", "name": "日本", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "SG", "name": "新加坡", "group": "INTERNATIONAL_REGIONAL"},
    {"code": "AU", "name": "澳大利亚", "group": "INTERNATIONAL_REGIONAL"},
]

# Ordered process topics determine the relevance of each country's references.
# Codes, rather than list positions, keep expanded/reordered templates stable.
PROCESS_DOMAINS = {
    "food-beverage": {"SUP": ["procurement", "quality", "trade"], "POS": ["sales", "finance", "privacy"], "SAFE": ["quality", "safety"], "CEN": ["quality", "safety", "procurement"], "MENU": ["quality", "sales"], "STORE": ["governance", "safety", "quality"], "PEOPLE": ["people", "privacy", "safety"], "WASTE": ["environment", "quality", "finance"]},
    "manufacturing": {"PUR": ["procurement", "trade", "anti_bribery"], "INV": ["finance", "quality", "safety"], "QLT": ["quality", "safety"], "PLAN": ["quality", "finance", "safety"], "EHS": ["safety", "environment", "people"]},
    "commerce": {"SKU": ["sales", "quality", "privacy"], "ORD": ["sales", "trade", "privacy"], "SET": ["finance", "sales"], "MERCH": ["procurement", "quality", "anti_bribery"], "DATA": ["privacy", "sales"]},
    "saas": {"IAM": ["privacy", "governance"], "CHG": ["privacy", "quality"], "REC": ["privacy", "governance"], "SDLC": ["privacy", "quality", "trade"], "TPRM": ["procurement", "privacy", "anti_bribery"]},
    "logistics": {"DSP": ["safety", "quality", "trade"], "FRT": ["finance", "sales"], "AST": ["procurement", "safety", "finance"], "FLEET": ["safety", "environment", "people"], "CLAIM": ["sales", "quality", "finance"]},
    "construction": {"PRJ": ["governance", "sales", "anti_bribery"], "SUB": ["procurement", "safety", "people"], "CST": ["finance", "procurement"], "HSE": ["safety", "environment", "people"], "CASH": ["finance", "sales"]},
    "healthcare": {"PRV": ["privacy", "quality"], "BIL": ["finance", "sales", "privacy"], "MED": ["quality", "procurement", "safety"], "CLIN": ["quality", "safety", "privacy"], "PROC": ["procurement", "anti_bribery", "quality"]},
    "professional-services": {"CLI": ["governance", "sales", "anti_bribery"], "DEL": ["quality", "sales", "privacy"], "REV": ["finance", "sales"], "BILL": ["finance", "sales"], "CONF": ["privacy", "people"]},
    "finance-services": {"KYC": ["trade", "privacy", "governance"], "TXN": ["finance", "trade", "privacy"], "TRE": ["finance", "governance"], "AML": ["trade", "finance", "governance"], "PROD": ["sales", "governance", "privacy"]},
    "property": {"LEASE": ["sales", "governance", "privacy"], "FEE": ["finance", "sales"], "MNT": ["procurement", "safety", "quality"], "TENANT": ["sales", "privacy"], "SAFE": ["safety", "people"]},
    "education": {"ENR": ["sales", "finance", "privacy"], "CLS": ["quality", "people", "safety"], "STU": ["privacy", "safety"], "ADMIT": ["sales", "privacy", "governance"], "ASSET": ["procurement", "finance", "safety"]},
    "agriculture": {"INPUT": ["procurement", "quality", "environment"], "GROW": ["quality", "safety", "environment"], "HARV": ["quality", "trade", "sales"], "PEST": ["quality", "environment", "safety"], "COLD": ["quality", "safety", "trade"]},
    "energy-utilities": {"MRO": ["safety", "people", "environment"], "METER": ["finance", "quality", "sales"], "SPARE": ["procurement", "quality", "finance"], "OUTAGE": ["safety", "governance", "people"], "ENV": ["environment", "safety"]},
    "general-enterprise": {"SALE": ["sales", "finance", "trade"], "AP": ["finance", "procurement", "anti_bribery"], "CLOSE": ["finance", "governance"], "HR": ["people", "privacy"], "VEND": ["procurement", "anti_bribery", "trade"]},
}

LAW_DOMAINS = {
    "company-law": ["governance", "finance"], "work-safety": ["safety", "people"],
    "personal-info": ["privacy", "people"], "data-security": ["privacy"],
    "network-data-security": ["privacy", "procurement"], "consumer-rights-regulation": ["sales", "quality"],
    "food-safety-regulation": ["quality", "safety", "procurement"], "food-safety-law": ["quality", "safety", "procurement"],
    "food-traceability": ["quality", "procurement", "trade"], "food-safety-duty": ["quality", "safety", "governance"],
    "restaurant-chain-safety": ["quality", "safety", "procurement"], "product-quality": ["quality", "sales"],
    "industrial-product-license": ["quality", "procurement"], "special-equipment": ["safety", "quality"],
    "e-commerce-law": ["sales", "privacy", "trade"], "online-transactions-measures": ["sales", "privacy"],
    "cybersecurity-law": ["privacy"], "medical-institutions": ["quality", "governance"],
    "medical-quality": ["quality", "safety"], "medical-records": ["privacy", "quality"],
    "road-transport": ["safety", "quality", "trade"], "dangerous-goods-road": ["safety", "trade"],
    "dangerous-goods-safety": ["safety", "quality"], "construction-quality": ["quality", "procurement"],
    "construction-safety": ["safety", "people", "procurement"], "cpa-law": ["quality", "governance", "finance"],
    "lawyers-law": ["quality", "governance", "privacy"], "bank-insurance-operational-risk": ["finance", "governance", "privacy"],
    "aml-law": ["trade", "finance", "governance"], "property-management": ["sales", "quality", "safety"],
    "private-education": ["sales", "quality", "governance"], "out-of-school-training-penalty": ["sales", "quality", "people"],
    "training-finance": ["finance", "sales"], "agri-product-quality": ["quality", "procurement", "trade"],
    "pesticide-regulation": ["quality", "environment", "safety"], "energy-law": ["environment", "governance"],
    "power-hidden-dangers": ["safety", "quality"], "accounting-law": ["finance"],
    "us-sox-404": ["finance", "governance"], "us-fcpa": ["anti_bribery", "finance", "procurement", "sales"],
    "eu-gdpr": ["privacy", "people"], "uk-bribery": ["anti_bribery", "procurement", "sales"],
    "jp-appi": ["privacy", "people"], "sg-pdpa": ["privacy", "people"],
    "au-privacy": ["privacy", "people"], "us-ccpa": ["privacy", "sales"],
}

for _regulation in REGULATIONS:
    _regulation.setdefault("domain_keys", LAW_DOMAINS.get(_regulation["id"], []))


def _country_guidance(industry_key: str, process: dict, country: dict, specific: dict | None) -> dict:
    code, name = country["code"], country["name"]
    domains = PROCESS_DOMAINS.get(industry_key, {}).get(process["code"], ["governance"])
    seed_ids = specific["law_ids"] if code == "CN" and specific else []
    candidates = []
    for order, law in enumerate(REGULATIONS):
        if law["country_code"] != code or industry_key not in law["industry_keys"]:
            continue
        score = sum((len(domains) - index) * 3 for index, domain in enumerate(domains) if domain in law["domain_keys"])
        if law["id"] in seed_ids:
            score += 15
        if not score:
            continue
        if len(law["industry_keys"]) < len(ALL_INDUSTRIES):
            score += 2
        candidates.append((score, -order, law))
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    laws = [item[2] for item in candidates[:6]]
    if code == "CN" and specific:
        focus = specific["focus"]
        risk_prompt = specific["risk_prompt"]
        checkpoints = list(specific["checkpoints"])
    else:
        focus = f"{name}业务：围绕{process['name']}核对以下参考的适用条件，并将相关责任落实到岗位、审批、执行记录和异常处理。" if laws else f"当前尚未收录{name}与{process['name']}直接相关的法规映射；先核对当地主管机关及属地规则，再调整流程。"
        risk_prompt = f"{process['risk']} 经营主体、场所、产品、客户和跨境数据可能影响{name}法规的适用；先核对每项资料的适用边界。"
        checkpoints = []
    checkpoints.extend(f"【{law['title']}】适用时核查：{law['obligations'][0]}" for law in laws[:4] if law.get("obligations"))
    checkpoints.extend([
        f"流程优化参考：{process['test']}",
        f"证据设计参考：{process['evidence']}；按当地保存期限和权限要求确定保存方式，记录异常责任人、整改及复核结论。",
    ])
    return {
        "legal_focus": focus, "risk_prompt": risk_prompt,
        "compliance_checkpoints": list(dict.fromkeys(checkpoints)),
        "regulations": [law["id"] for law in laws],
    }


def get_compliance_library(
    current_industry: str | None,
    company_processes: list[dict],
    industries_to_include: set[str] | None = None,
) -> dict:
    unique = {}
    for template in TEMPLATES.values():
        unique.setdefault(template["industry_key"], {
            "key": template["industry_key"], "name": template["industry"],
            "description": template["industry_description"],
        })
    industry_names = {row["name"]: key for key, row in unique.items()}
    selected_key = current_industry if current_industry in unique else industry_names.get(current_industry or "", "general-enterprise")
    target_industries = industries_to_include if industries_to_include is not None else {selected_key}

    process_guidance = {}
    for industry_key, checks in PROCESS_GUIDANCE.items():
        if industry_key not in target_industries:
            continue
        template = TEMPLATES[f"{industry_key}-systematized"]
        industry = next(item for item in INDUSTRIES if item["key"] == industry_key)
        template_by_code = {item["code"]: item for item in template["processes"]}
        rows = []
        for source in industry["processes"]:
            process = deepcopy(template_by_code.get(source["code"]) or {
                **source,
                "department": industry["departments"][source["dept"]],
                "control_design": f"{source['control']} {MATURITY['systematized']['control_suffix']}",
                "sample_guidance": MATURITY["systematized"]["sample"],
            })
            mapped_index = PROCESS_CHECK_CODE_ORDER.get(industry_key, {}).get(process.get("code"))
            specific = checks[mapped_index] if mapped_index is not None and mapped_index < len(checks) else None
            country_guidance = {
                country["code"]: _country_guidance(industry_key, process, country, specific)
                for country in JURISDICTIONS
            }
            rows.append({
                **deepcopy(process),
                **deepcopy(country_guidance["CN"]),
                "jurisdiction_guidance": country_guidance,
            })
        process_guidance[industry_key] = rows

    return {
        "checked_on": "2026-10-02",
        "jurisdiction_options": deepcopy(JURISDICTIONS),
        "current_industry_key": selected_key,
        "industries": list(unique.values()),
        "regulations": deepcopy(REGULATIONS),
        "process_guidance": process_guidance,
        "company_processes": company_processes,
        "disclaimer": "本库是基于公开官方资料编制的起步索引与内控设计参考，不是穷尽的法规清单、法律意见或合规结论。实际适用取决于经营主体、地域、许可、产品/服务、交易模式和数据类型；实施前应在国家及属地主管部门核对现行文本、施行/废止状态和具体义务，必要时由法务或专业顾问复核。",
    }
