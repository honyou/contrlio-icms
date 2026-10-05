"""Additional China compliance references checked against official texts.

The controls below are short implementation references, with applicability
boundaries kept on every entry. This module is independent of the core library
so the library can import the additions without a circular import.
"""

from __future__ import annotations


_ALL_INDUSTRIES = [
    "food-beverage", "manufacturing", "commerce", "saas", "logistics",
    "construction", "healthcare", "professional-services", "finance-services",
    "property", "education", "agriculture", "energy-utilities", "general-enterprise",
]


def _china(id: str, title: str, authority: str, category: str,
           source_kind: str, summary: str, obligations: list[str],
           process_tags: list[str], domain_keys: list[str], source_url: str,
           scope_note: str, effective_date: str | None = None,
           industry_keys: list[str] | None = None) -> dict:
    return {
        "id": id,
        "title": title,
        "authority": authority,
        "category": category,
        "jurisdiction": "中国·内地",
        "country_code": "CN",
        "country_name": "中国",
        "source_kind": source_kind,
        "summary": summary,
        "obligations": obligations,
        "process_tags": process_tags,
        "domain_keys": domain_keys,
        "industry_keys": list(industry_keys or _ALL_INDUSTRIES),
        "source_url": source_url,
        "scope_note": scope_note,
        "checked_on": "2026-10-02",
        "effective_date": effective_date,
        "status": "官方正文已核对；适用时核对现行文本及配套规则",
    }


CHINA_EXTENSIONS = [
    _china(
        "cn-internal-control-basic", "企业内部控制基本规范（财会〔2008〕7号）",
        "财政部、证监会、审计署等五部门", "公司治理与内控", "官方指引",
        "以内部环境、风险评估、控制活动、信息与沟通、内部监督五要素组织企业内控建设，并覆盖合规、资产、报告、运营和战略目标。",
        ["识别重要业务和风险，落实责任分工、授权审批、岗位制衡及控制证据。", "执行规范的企业建立内部监督和内控评价机制，跟踪缺陷及整改；具体报告义务按实施范围核验。"],
        ["公司治理", "风险评估", "授权审批", "内部监督", "缺陷整改"],
        ["governance", "finance", "procurement", "sales", "people"],
        "https://kjs.mof.gov.cn/zhengcefabu/200807/t20080704_55982.htm",
        "规范针对境内大中型企业；通知首先在上市公司范围施行并鼓励非上市大中型企业执行，小企业和其他单位可参照。强制实施、评价与审计义务需结合后续监管要求和主体身份确认。",
        "2009-07-01",
    ),
    _china(
        "cn-internal-control-guidelines", "企业内部控制配套指引（财会〔2010〕11号）",
        "财政部、证监会、审计署等五部门", "公司治理与内控", "官方指引",
        "包括18项应用指引以及评价、审计指引，为采购、销售、资金、资产、合同、信息系统等流程建立控制和评价提供参考。",
        ["把业务风险转化为控制点、责任人、频率、授权层级和可核对的记录。", "评价工作覆盖设计与运行，保留评价依据、缺陷认定和整改情况；审计安排按适用监管要求确定。"],
        ["采购付款", "销售收款", "资金管理", "合同管理", "信息系统", "内控评价"],
        ["governance", "finance", "procurement", "sales", "people"],
        "https://kjs.mof.gov.cn/zhengcefabu/201005/t20100505_290459.htm",
        "指引具有指导和示范性质，应结合行业与企业特点使用。通知分别安排境内外同时上市公司和沪深主板上市公司实施；企业当前义务应对照后续实施通知及上市地规则核实。",
        "2011-01-01",
    ),
    _china(
        "cn-labor-contract", "中华人民共和国劳动合同法（2012年修正）",
        "全国人大常委会 / 上海市人民政府官方正文", "劳动用工", "法律",
        "规范劳动合同订立、履行、变更、解除、终止，以及试用期、劳务派遣和非全日制用工。",
        ["建立职工名册，及时签订书面合同，核对合同期限、试用期及必备条款。", "工资、加班、合同变更和解除终止按法定条件办理，保存告知、协商、送达及结算依据。", "涉及员工切身利益的规章制度履行讨论、协商和公示或告知程序。"],
        ["招聘入职", "劳动合同", "薪酬考勤", "调岗变更", "离职结算", "劳务派遣"],
        ["people", "governance"],
        "https://www.shanghai.gov.cn/rcjygj/20250606/658d064be68c46fc892530a8cde92258.html",
        "适用于内地用人单位与劳动者建立的劳动关系；外包或个人服务合同不能仅凭名称排除劳动关系。2012年修正内容自2013-07-01施行，工时、最低工资、社保和争议处理另核对属地及配套规则。",
        "2013-07-01",
    ),
    _china(
        "cn-civil-code-contracts", "中华人民共和国民法典（合同编与企业交易参考）",
        "全国人民代表大会 / 工业和信息化部天津市通信管理局官方正文", "合同与履约", "法律",
        "提供合同订立、效力、履行、变更、终止和违约责任基础规则，涵盖买卖、租赁、建设工程、运输、技术和物业服务等典型合同。",
        ["签约前核对主体、代理权限、合同标的、交付验收、付款条件及争议条款。", "格式条款涉及重大利害关系时履行合理提示和说明义务，保存签署与沟通证据。", "合同变更、履约异常、解除及索赔建立审批、通知和时效跟踪记录。"],
        ["合同审查", "采购订单", "销售签约", "交付验收", "合同变更", "争议索赔"],
        ["procurement", "sales", "finance", "governance", "trade"],
        "https://tjca.miit.gov.cn/zwgk/zcwj/flfg/art/2020/art_20cf1a2e1b854924b5caa744c8045d1f.html",
        "先确认交易关系、合同类型、主体及是否涉外；劳动等特别法律、司法解释和涉外法律适用规则可能影响结论。审批或留痕是流程设计参考，不表示每项交易均有统一法定表单要求。",
        "2021-01-01",
    ),
    _china(
        "cn-unfair-competition", "中华人民共和国反不正当竞争法（2025年修订）",
        "全国人大常委会 / 国家市场监督管理总局法规库", "反腐败与公平竞争", "法律",
        "规制商业贿赂、混淆、虚假宣传、侵犯商业秘密及网络不正当竞争等行为；2025年修订同时涉及平台定价和大型企业拖欠中小企业账款。",
        ["审查第三方佣金、折扣、礼品和招待的业务目的、受益人及审批，折扣和佣金真实入账。", "商品宣传、评价、竞品资料和商业秘密的获取使用设置审核与访问限制。", "按平台身份和企业规模审查交易规则、付款条件及账款逾期，记录异常处置。"],
        ["供应商准入", "销售佣金", "礼品招待", "宣传审核", "商业秘密", "采购付款"],
        ["anti_bribery", "procurement", "sales", "finance", "governance"],
        "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_3737890d856a4e44a8ea07c50c90c116.html",
        "境内经营活动以及法律规定影响境内竞争的境外行为需分别识别；平台、大型企业和中小企业等角色影响具体规则。不得仅凭单笔招待或付款形式判断违法，需核对目的、对象与事实。",
        "2025-10-15",
    ),
    _china(
        "cn-environmental-protection", "中华人民共和国环境保护法（2014年修订）",
        "全国人大常委会 / 生态环境部", "生态环境", "法律",
        "确立生产经营者污染防治和环境保护责任，涉及建设项目、污染排放、环境信息、风险预防及突发事件处置。",
        ["项目建设和工艺变更前识别环境影响评价、配套设施及适用排放许可要求。", "建立污染防治设施、排放监测和异常处置记录，对重点排污及信息公开义务专项核验。", "识别环境事故风险，完善预防、应急准备、处置与报告责任。"],
        ["项目立项", "工艺变更", "污染排放", "废弃物管理", "设备维护", "环境应急"],
        ["environment", "safety", "governance", "procurement"],
        "https://www.mee.gov.cn/ywgz/fgbz/fl/201404/t20140425_271040.shtml",
        "适用内地环境保护活动；具体许可、监测和公开范围依企业排污行为、项目类别、行业专项法律及属地规则确定。办公型企业与生产排污企业的义务不能一概等同。",
        "2015-01-01",
        ["manufacturing", "construction", "agriculture", "energy-utilities", "logistics", "food-beverage", "property", "general-enterprise"],
    ),
    _china(
        "cn-invoice-administration", "中华人民共和国发票管理办法（2023年修订）",
        "国务院 / 国家税务总局政策法规库", "税务与票据", "行政法规",
        "规范纸质和电子发票的领用、开具、取得、保管和检查，确立电子发票与纸质发票的同等法律效力。",
        ["按真实经营业务开具和取得发票，核对交易主体、金额、内容与合同和收付款记录。", "建立发票领用、权限、电子数据保管和异常票据处理流程，避免与实际经营业务不符的开具或取得。", "将红冲、作废、重复报销和票据异常与财务复核及税务申报关联。"],
        ["开票申请", "采购付款", "费用报销", "销售收款", "票据保管", "税务申报"],
        ["finance", "procurement", "sales"],
        "https://fgk.chinatax.gov.cn/zcfgk/c100010/c5195084/content.html",
        "适用于内地发票印制、领用、开具、取得、保管和缴销活动；税种、扣除或抵扣条件、电子发票及红冲操作另按现行税收政策和实施细则核对。该条目不单独判断进项可否抵扣。",
        "2023-07-20",
    ),
    _china(
        "cn-export-control", "中华人民共和国出口管制法",
        "全国人大常委会 / 商务部安全与管制局", "出口管制", "法律",
        "对规定范围内货物、技术、服务和相关数据实行清单、临时管制、许可及最终用户和最终用途管理。",
        ["报价、签约和发运前核对物项分类、管制清单、临时措施、目的地及交易对象。", "需要许可时在履约前办理许可，核对数量、对象、用途和有效条件，并关联报关文件。", "核验最终用户和最终用途证明，发现可能改变时按规定报告并升级处理。"],
        ["产品分类", "出口报价", "客户准入", "许可审批", "技术提供", "发运报关"],
        ["trade", "sales", "procurement", "governance"],
        "https://www.mofcom.gov.cn/zfxxgk/gkml/art/2020/art_76b5fa416a4c42afa8af295eefffdffc.html",
        "仅按实际物项及活动判断是否受管制，范围可涉及技术资料、境内向外国主体提供等活动；清单、临时管制和特定目的地措施变化较快，必须在交易时另核对最新公告。",
        "2020-12-01",
        ["manufacturing", "commerce", "logistics", "saas", "professional-services", "agriculture", "energy-utilities", "general-enterprise"],
    ),
    _china(
        "cn-customs-law", "中华人民共和国海关法（2021年修正）",
        "全国人大常委会 / 外交部官方法律正文", "海关与贸易", "法律",
        "规定进出关境货物、运输工具及物品的海关监管、申报、查验和相关责任，是进出口关务流程的基础参考。",
        ["如实申报货物并交验必要许可证件和单证，核对订单、发票、物流与申报资料。", "管理代理报关授权、单证更正、监管货物转移和查验异常，保留办理依据。", "加工贸易、保税或暂时进出境业务按实际监管模式建立期限、库存和核销跟踪。"],
        ["进口采购", "出口销售", "报关复核", "保税库存", "物流交接", "关务归档"],
        ["trade", "procurement", "sales", "finance", "governance"],
        "https://www.fmprc.gov.cn/web/wjb_673085/zzjg_673183/bjhysws_674671/bhflfg/ldbjglxgfl/202303/P020230313589081879122.pdf",
        "适用于进出中国内地关境的监管活动；贸易模式、货物类别及特殊监管区域决定具体手续。关税、原产地、检验检疫和申报规范还需对照现行专项法律与海关公告，不仅凭本法确定税率。",
        None,
        ["manufacturing", "commerce", "logistics", "food-beverage", "agriculture", "energy-utilities", "general-enterprise"],
    ),
    _china(
        "cn-cross-border-data", "促进和规范数据跨境流动规定（国家网信办令第16号）",
        "国家互联网信息办公室", "数据出境", "部门规章",
        "调整数据出境安全评估、个人信息出境标准合同和认证的适用条件，明确重要数据识别、程序豁免、数量门槛和后续保护责任。",
        ["建立出境数据、接收方、场景和年度累计数量台账，区分个人信息、敏感个人信息和重要数据。", "逐项判断关基身份、程序豁免、标准合同或认证、安全评估路径，记录判断依据与变更。", "对个人信息出境依法核对告知、单独同意及影响评估，保留安全措施和事件处置记录。"],
        ["海外系统", "数据导出", "跨境人事", "供应商管理", "客户资料", "安全事件"],
        ["privacy", "people", "trade", "procurement", "governance"],
        "https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm",
        "按主体、数据类别、用途、出境数量及自贸区规则具体核对。免予列明的出境程序不等于免除个人信息保护和数据安全义务；境外访问境内系统也应识别是否构成出境活动。",
        "2024-03-22",
    ),
]
