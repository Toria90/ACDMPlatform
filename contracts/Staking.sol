pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking is AccessControl {

    uint256 public depositRatePercent;
    uint256 public maturityPeriodMin;
    uint256 public depositHoldTimeMin;

    address public depositInstrumentAddress;
    address public rewardInstrumentAddress;

    address public depositLiquidityAddress;
    address public rewardLiquidityAddress;

    mapping(address => AccountDeposit) internal _deposits;

    bytes32 public constant STAKING_SETTINGS_ROLE = keccak256("STAKING_SETTINGS_ROLE");
    
    struct AccountDeposit{
        uint256 amount;
        uint256 timestamp;
    }
    
    constructor(
        address _depositInstrumentAddress,
        address _rewardInstrumentAddress, 
        uint256 _depositRatePercent, 
        uint256 _maturityPeriosMin,
        uint256 _depositHoldTimeMin){
        
        depositInstrumentAddress = _depositInstrumentAddress;
        rewardInstrumentAddress = _rewardInstrumentAddress;
        depositRatePercent = _depositRatePercent;
        maturityPeriodMin = _maturityPeriosMin;
        depositHoldTimeMin = _depositHoldTimeMin;

        depositLiquidityAddress = address(this);
        rewardLiquidityAddress = address(this);

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(STAKING_SETTINGS_ROLE, _msgSender());
    }
    
    function setDepositHoldTimeMin(uint256 value) public  onlyRole(STAKING_SETTINGS_ROLE){
        depositHoldTimeMin = value;
    }
    
    function stake(uint256 amount) public {
        IERC20 depositToken = IERC20(depositInstrumentAddress);
        require(depositToken.allowance(msg.sender, depositLiquidityAddress) >= amount, "don't allowance");
        
        _claim(msg.sender);
        
        _deposits[msg.sender].amount += amount;
        _deposits[msg.sender].timestamp = block.timestamp;
        
        SafeERC20.safeTransferFrom(depositToken, msg.sender, depositLiquidityAddress, amount);
        
        emit OpenDeposit(msg.sender, amount);
    }

    function claim() public{
        address account = msg.sender;
        _claim(account);
    }

    function unstake() public{
        AccountDeposit memory deposit = _deposits[msg.sender];
        require(deposit.timestamp > 0, "don't have deposits");
        require(_canWithdrawal() && deposit.timestamp+depositHoldTimeMin*60 <= block.timestamp, "deposit hold");
        
        _claim(msg.sender);

        uint256 depositAmount = deposit.amount;
        IERC20 depositToken = IERC20(depositInstrumentAddress);
        SafeERC20.safeTransferFrom(depositToken, depositLiquidityAddress, msg.sender, depositAmount);
        
        delete _deposits[msg.sender];
        
        emit CloseDeposit(msg.sender, depositAmount);
    }
    
    function _claim(address account) private {
        if (_deposits[account].amount>0 && _deposits[account].timestamp + maturityPeriodMin*60 <= block.timestamp)
        {
            uint256 rewardAmount = _deposits[account].amount * depositRatePercent / 100;
            IERC20 rewardToken = IERC20(rewardInstrumentAddress);
            SafeERC20.safeTransferFrom(rewardToken, rewardLiquidityAddress, account, rewardAmount);
            _deposits[account].timestamp = block.timestamp;
            
            emit Reward(account, rewardAmount);
        }
    }

    function _canWithdrawal() internal virtual view returns (bool){
        return true;
    }
    
    event OpenDeposit(address indexed account, uint256 amount);
    event CloseDeposit(address indexed account, uint256 amount);
    event Reward(address indexed account, uint256 amount);
    
}
